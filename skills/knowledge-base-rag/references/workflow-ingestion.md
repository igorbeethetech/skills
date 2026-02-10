# Ingestion Workflows Reference

## Table of Contents
1. [Shared Processing Pipeline](#shared-processing-pipeline)
2. [Workflow 1: File Upload](#workflow-1-file-upload)
3. [Workflow 2: URL Scraping](#workflow-2-url-scraping)
4. [Workflow 3: Text Input](#workflow-3-text-input)
5. [Contextual Chunking Implementation](#contextual-chunking-implementation)
6. [Error Handling](#error-handling)

---

## Shared Processing Pipeline

All three source types converge into the same processing pipeline after text extraction.
This keeps the system DRY and ensures consistent indexing quality.

```
[Text extracted from any source]
    → Save Source Record (knowledge_sources)
    → Update Status to 'processing'
    → Chunk Text (recursive, sentence-boundary aware)
    → [If advanced] Contextualize Each Chunk (LLM call)
    → Combine Context + Content for Search
    → Generate Embeddings (OpenAI, batched)
    → Store Chunks + Embeddings (document_chunks)
    → Update Source Status to 'completed' with chunk_count
    → Respond Success
```

### Chunking Node (Code)

```javascript
const text = $json.extractedText;
const sourceId = $json.sourceId;
const CHUNK_SIZE = 3200;  // ~800 tokens × 4 chars/token
const OVERLAP = 800;      // ~200 tokens overlap

function chunkText(text, chunkSize, overlap) {
  const chunks = [];
  let start = 0;
  
  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);
    
    // Try to break at sentence boundary (. ! ? followed by space/newline)
    if (end < text.length) {
      const searchWindow = text.slice(start + Math.floor(chunkSize * 0.7), end);
      const sentenceBreaks = [...searchWindow.matchAll(/[.!?]\s/g)];
      if (sentenceBreaks.length > 0) {
        const lastBreak = sentenceBreaks[sentenceBreaks.length - 1];
        end = start + Math.floor(chunkSize * 0.7) + lastBreak.index + 2;
      }
    }
    
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 50) { // Skip tiny fragments
      chunks.push(chunk);
    }
    
    start = end - overlap;
    if (start >= text.length) break;
    if (end >= text.length) break;
  }
  
  return chunks;
}

const chunks = chunkText(text, CHUNK_SIZE, OVERLAP);

return chunks.map((chunk, i) => ({
  json: {
    sourceId,
    content: chunk,
    chunkIndex: i,
    totalChunks: chunks.length,
    tokenEstimate: Math.ceil(chunk.length / 4)
  }
}));
```

### Contextual Chunking Node (Code — calls LLM)

This node adds context to each chunk before embedding. It calls an LLM to generate
a short contextual summary.

**Option A: Via n8n OpenAI node (simpler)**

Use an OpenAI Chat node with this system prompt, receiving the document text and
chunk from previous nodes. The full document should be stored in a workflow variable
or passed through the pipeline.

**Option B: Via HTTP Request (more control)**

```javascript
// Contextual chunking — generates context for each chunk
const chunk = $json.content;
const sourceId = $json.sourceId;

// Get the full document text (stored earlier in the pipeline)
const fullDocument = $('Extract Text').first().json.extractedText;

// If document is too large for context, use first 6000 tokens worth
const maxDocChars = 24000; // ~6000 tokens
const docForContext = fullDocument.length > maxDocChars
  ? fullDocument.slice(0, maxDocChars) + '\n[... document truncated ...]'
  : fullDocument;

const prompt = `<document>
${docForContext}
</document>

Here is the chunk we want to situate within the whole document:
<chunk>
${chunk}
</chunk>

Please give a short succinct context to situate this chunk within the overall document for the purposes of improving search retrieval of the chunk. Answer only with the succinct context and nothing else.`;

// This will be sent to OpenAI via the next HTTP Request node
return [{
  json: {
    sourceId,
    content: chunk,
    chunkIndex: $json.chunkIndex,
    totalChunks: $json.totalChunks,
    contextPrompt: prompt
  }
}];
```

Then use an HTTP Request or OpenAI node to get the context, and merge:

```javascript
// After receiving context from LLM
const context = $json.choices?.[0]?.message?.content || '';
const chunk = $('Contextualize Chunks').item;

const contentForSearch = context 
  ? `${context}\n\n${chunk.json.content}`
  : chunk.json.content;

return [{
  json: {
    sourceId: chunk.json.sourceId,
    content: chunk.json.content,           // Original chunk (for display)
    context: context,                       // Generated context
    contentForSearch: contentForSearch,      // Combined (for embedding + BM25)
    chunkIndex: chunk.json.chunkIndex,
    totalChunks: chunk.json.totalChunks
  }
}];
```

**Cost optimization:** Use a fast model (gpt-4o-mini, claude-3-haiku) for context
generation. The context doesn't need to be perfect — it just needs to add enough
information to improve retrieval.

### Embedding Node

Generate embeddings for `contentForSearch` (the contextualized version):

```json
{
  "parameters": {
    "method": "POST",
    "url": "https://api.openai.com/v1/embeddings",
    "authentication": "predefinedCredentialType",
    "nodeCredentialType": "openAiApi",
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={{ JSON.stringify({ input: $json.contentForSearch, model: 'text-embedding-3-small' }) }}",
    "options": {
      "batching": {
        "batch": { "batchSize": 20, "batchInterval": 1000 }
      }
    }
  },
  "name": "Generate Embedding",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2
}
```

### Store Chunk Node (PostgreSQL)

```sql
INSERT INTO document_chunks (
    source_id, content, context, content_for_search,
    chunk_index, embedding, token_count, metadata
) VALUES (
    $1, $2, $3, $4, $5, $6::vector, $7, $8::jsonb
) RETURNING id;
```

Values:
- `$1` → sourceId
- `$2` → content (original)
- `$3` → context (LLM-generated, or NULL if basic mode)
- `$4` → contentForSearch (context + content combined)
- `$5` → chunkIndex
- `$6` → embedding formatted as `[0.1, 0.2, ...]` string
- `$7` → tokenCount
- `$8` → metadata JSON

**Critical:** The `search_vector` column (tsvector for BM25) is auto-generated from
`content_for_search`. No need to set it explicitly — PostgreSQL handles it via the
`GENERATED ALWAYS AS` clause in the table definition.

---

## Workflow 1: File Upload

```
Webhook (POST multipart, path: /kb/upload-file)
  → Validate File (Code)
  → Save Source Record (PostgreSQL)
  → Update Status 'processing'
  → [Switch by file type]
    → PDF: Extract from File node (operation: pdf)
    → DOCX: Extract from File node (operation: docx)
    → TXT/MD: Read Binary as UTF-8 (Code)
  → [Merge] → Shared Processing Pipeline
```

### Validate File (Code)

```javascript
const ALLOWED = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'text/plain': 'txt',
  'text/markdown': 'md'
};
const MAX_SIZE = 10 * 1024 * 1024;

const binaryKey = Object.keys($input.first().binary || {})[0];
if (!binaryKey) throw new Error('No file uploaded');

const binary = $input.first().binary[binaryKey];
if (!ALLOWED[binary.mimeType]) {
  throw new Error(`Type "${binary.mimeType}" not supported. Allowed: PDF, DOCX, TXT, MD`);
}
if (binary.fileSize > MAX_SIZE) {
  throw new Error(`File too large (${(binary.fileSize/1024/1024).toFixed(1)}MB). Max: 10MB`);
}

const body = $input.first().json.body || $input.first().json;
return [{
  json: {
    sourceType: 'file',
    title: body.title || binary.fileName,
    fileName: binary.fileName,
    fileSize: binary.fileSize,
    mimeType: binary.mimeType,
    fileType: ALLOWED[binary.mimeType],
    category: body.category || 'general',
    tags: (body.tags || '').split(',').map(t => t.trim()).filter(Boolean),
    description: body.description || ''
  },
  binary: { data: binary }
}];
```

### Save Source Record (PostgreSQL)

```sql
INSERT INTO knowledge_sources (
    source_type, title, file_name, file_size, mime_type,
    category, tags, description, status
) VALUES (
    'file', $1, $2, $3, $4, $5, $6::text[], $7, 'pending'
) RETURNING id, title, status;
```

### Read TXT/MD (Code — for plain text files)

```javascript
const binaryData = await this.helpers.getBinaryDataBuffer(0, 'data');
const text = binaryData.toString('utf-8');
const sourceId = $('Save Source').first().json.id;

if (!text.trim()) throw new Error('File is empty');

return [{
  json: { sourceId, extractedText: text.trim() }
}];
```

---

## Workflow 2: URL Scraping

```
Webhook (POST JSON, path: /kb/add-url)
  → Validate URL
  → Save Source Record (source_type: 'url')
  → Update Status 'processing'
  → Fetch URL Content (HTTP Request)
  → Extract Text from HTML (Code)
  → Shared Processing Pipeline
```

### Validate & Save URL (Code)

```javascript
const body = $input.first().json.body || $input.first().json;
const url = body.url;

if (!url || !url.match(/^https?:\/\/.+/)) {
  throw new Error('Invalid URL. Must start with http:// or https://');
}

return [{
  json: {
    sourceType: 'url',
    title: body.title || url,
    sourceUrl: url,
    category: body.category || 'general',
    tags: (body.tags || '').split(',').map(t => t.trim()).filter(Boolean),
    description: body.description || ''
  }
}];
```

### Fetch URL Content (HTTP Request)

```json
{
  "parameters": {
    "method": "GET",
    "url": "={{ $json.sourceUrl }}",
    "options": {
      "redirect": { "followRedirects": true, "maxRedirects": 5 },
      "timeout": 30000
    }
  },
  "name": "Fetch URL",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "continueOnFail": true
}
```

### Extract Text from HTML (Code)

```javascript
const html = $json.data || $json.body || '';
const sourceId = $('Save Source').first().json.id;

// Simple but effective HTML text extraction
function extractText(html) {
  let text = html;
  // Remove scripts, styles, nav, footer
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '');
  text = text.replace(/<header[\s\S]*?<\/header>/gi, '');
  // Convert block elements to newlines
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|br|hr)[^>]*>/gi, '\n');
  // Remove remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');
  // Decode HTML entities
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  // Clean whitespace
  text = text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();
  return text;
}

const text = extractText(html);
if (text.length < 50) throw new Error('Could not extract meaningful text from URL');

return [{ json: { sourceId, extractedText: text } }];
```

**For better scraping:** Consider using Crawl4AI, Firecrawl, or ScrapeNinja community
nodes in n8n for JavaScript-rendered pages. The HTTP Request + HTML extraction approach
above works well for static pages but misses dynamic content.

---

## Workflow 3: Text Input

The simplest workflow — user provides text directly.

```
Webhook (POST JSON, path: /kb/add-text)
  → Validate Text
  → Save Source Record (source_type: 'text')
  → Update Status 'processing'
  → Shared Processing Pipeline
```

### Validate & Prepare Text (Code)

```javascript
const body = $input.first().json.body || $input.first().json;
const text = body.content || body.text || '';

if (!text || text.trim().length < 50) {
  throw new Error('Text content is too short (minimum 50 characters)');
}

// If HTML, strip tags
let cleanText = text;
if (/<[^>]+>/.test(text)) {
  cleanText = text.replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

return [{
  json: {
    sourceType: 'text',
    title: body.title || cleanText.slice(0, 80) + '...',
    category: body.category || 'general',
    tags: (body.tags || '').split(',').map(t => t.trim()).filter(Boolean),
    description: body.description || '',
    extractedText: cleanText
  }
}];
```

---

## Contextual Chunking Implementation

### When to contextualize

The shared processing pipeline should include a Switch or IF node to decide:

- **If contextual chunking is enabled** (recommended default): Run the LLM
  contextualization step before embedding
- **If basic mode**: Skip directly to embedding

### LLM Model Selection for Context

Use the cheapest fast model available:
- **OpenAI**: `gpt-4o-mini` (~$0.00015 per chunk)
- **Anthropic**: `claude-3-haiku` (similar cost)

For a 50-page document with ~100 chunks, total context generation cost ≈ $0.015.

### Prompt Template

The prompt in the Contextualize node should be:

```
<document>
{full document text, truncated to ~6000 tokens if needed}
</document>

Here is the chunk we want to situate within the whole document:
<chunk>
{chunk text}
</chunk>

Please give a short succinct context to situate this chunk within the overall
document for the purposes of improving search retrieval of the chunk.
Answer only with the succinct context and nothing else.
```

### Example Output

**Original chunk:**
> "O prazo de devolução é de 7 dias corridos a partir do recebimento."

**Generated context:**
> "Esta seção faz parte da Política de Trocas e Devoluções da loja XYZ,
> específicamente sobre prazos de devolução para compras online."

**Combined (content_for_search):**
> "Esta seção faz parte da Política de Trocas e Devoluções da loja XYZ,
> específicamente sobre prazos de devolução para compras online.
>
> O prazo de devolução é de 7 dias corridos a partir do recebimento."

This combined text is what gets embedded AND indexed for BM25. Notice how the context
adds "Política de Trocas", "Devoluções", "loja XYZ" — all terms that improve both
semantic and keyword retrieval.

---

## Error Handling

Every ingestion workflow must have:

1. **Error Trigger node** — catches any unhandled error
2. **Update status to 'failed'** — with error message
3. **Respond with error** — so the caller knows what happened

```javascript
// Error handler Code node
const error = $json;
const sourceId = $('Save Source')?.first()?.json?.id;

return [{
  json: {
    sourceId: sourceId || null,
    error: error.message || 'Unknown processing error',
    timestamp: new Date().toISOString()
  }
}];
```

Then:
1. PostgreSQL: `UPDATE knowledge_sources SET status='failed', error_message=$2 WHERE id=$1;`
2. Respond to Webhook: HTTP 500 with error JSON
