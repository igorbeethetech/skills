# Code Mode: Project Patterns & Best Practices

## Table of Contents
1. [Project Structure](#project-structure)
2. [Environment Variables](#environment-variables)
3. [Error Handling](#error-handling)
4. [Background Processing](#background-processing)
5. [Adapting to Existing Projects](#adapting-to-existing-projects)
6. [Testing](#testing)

---

## Project Structure

### TypeScript (Express)

```
src/
  lib/
    db.ts                  — Pool connection, query helpers
    embeddings.ts          — OpenAI embedding calls
    chunker.ts             — Text splitting logic
    contextualizer.ts      — LLM-based context enrichment
    text-extractors.ts     — PDF/DOCX/TXT extraction
    url-scraper.ts         — URL content extraction
    reranker.ts            — (optional) Cohere reranking
  services/
    ingestion.service.ts   — Unified ingest pipeline (file, url, text)
    rag-query.service.ts   — Search + context formatting
  routes/
    knowledge.routes.ts    — REST endpoints for ingestion + query
  types/
    knowledge.types.ts     — Interfaces (SearchResult, RAGResponse, etc.)
  index.ts                 — Express app setup
schema.sql                 — Database setup
.env                       — Environment variables
package.json
tsconfig.json
```

### TypeScript (Next.js API Routes)

```
app/
  api/
    kb/
      upload-file/route.ts
      add-url/route.ts
      add-text/route.ts
      search/route.ts
      chat/route.ts
lib/
  kb/
    db.ts
    embeddings.ts
    chunker.ts
    contextualizer.ts
    text-extractors.ts
    url-scraper.ts
    ingestion.ts
    rag-query.ts
    types.ts
schema.sql
```

### Python (FastAPI)

```
app/
  core/
    database.py
    embeddings.py
    chunker.py
    contextualizer.py
    extractors.py
    scraper.py
  services/
    ingestion.py
    rag_query.py
  routes/
    knowledge.py
  models/
    schemas.py             — Pydantic request/response models
  main.py                  — FastAPI app
schema.sql
requirements.txt
.env
```

---

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://postgres:password@db.xxx.supabase.co:5432/postgres

# OpenAI
OPENAI_API_KEY=sk-...

# Optional: Cohere (for reranking)
COHERE_API_KEY=...

# RAG Configuration
RAG_CHUNK_SIZE=3200
RAG_CHUNK_OVERLAP=800
RAG_EMBEDDING_MODEL=text-embedding-3-small
RAG_CONTEXTUAL_CHUNKING=true
RAG_SEARCH_LANGUAGE=portuguese
RAG_MAX_FILE_SIZE=10485760
```

**Don't hardcode these.** Read from env so the same code works across environments.

---

## Error Handling

### Ingestion Errors

The ingestion pipeline must ALWAYS update the source status, even on failure:

```typescript
// Pattern: try/finally for status management
async function processSource(sourceId: string, workFn: () => Promise<void>) {
  try {
    await updateSourceStatus(sourceId, 'processing');
    await workFn();
    await updateSourceStatus(sourceId, 'completed', { chunkCount });
  } catch (error) {
    await updateSourceStatus(sourceId, 'failed', {
      errorMessage: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error; // Re-throw for the route handler to catch
  }
}
```

### Query Errors

Never let search errors crash the user's chat. Fail gracefully:

```typescript
export async function ragQuery(query: string): Promise<RAGResponse> {
  try {
    // ... search logic
  } catch (error) {
    console.error('RAG query failed:', error);
    return {
      context: 'Unable to search the knowledge base at this time.',
      sources: [],
      resultCount: 0,
      query
    };
  }
}
```

### File Processing Errors

Each file type can fail differently. Handle specifically:

```typescript
try {
  return await extractFromPDF(buffer);
} catch (error) {
  // PDF might be image-based (no extractable text)
  if (error.message.includes('no text')) {
    throw new Error('PDF appears to be image-based. OCR is not currently supported.');
  }
  throw error;
}
```

---

## Background Processing

For large files, ingestion can take seconds to minutes. Consider async processing:

### Option A: Synchronous (simple, for small files)

The API waits for the full pipeline to complete before responding. Good for files
under 5MB / 50 pages.

### Option B: Queue-based (production)

Return immediately with a `sourceId`, process in background:

```typescript
router.post('/upload-file', upload.single('file'), async (req, res) => {
  // Create source record
  const source = await insertSource({ ... });

  // Start processing in background (don't await)
  processSource(source.id, async () => { ... })
    .catch(err => console.error(`Processing failed for ${source.id}:`, err));

  // Respond immediately
  res.json({
    sourceId: source.id,
    status: 'pending',
    message: 'File uploaded. Processing started.'
  });
});

// Add a status check endpoint
router.get('/status/:sourceId', async (req, res) => {
  const source = await pool.query(
    'SELECT id, title, status, chunk_count, error_message FROM knowledge_sources WHERE id = $1',
    [req.params.sourceId]
  );
  res.json(source.rows[0]);
});
```

### Option C: Job queue (BullMQ, Celery)

For high-volume systems, push ingestion jobs to a proper queue:

```typescript
// TypeScript with BullMQ
import { Queue } from 'bullmq';

const ingestionQueue = new Queue('kb-ingestion', {
  connection: { host: 'localhost', port: 6379 }
});

// In route handler:
await ingestionQueue.add('process-file', {
  sourceId: source.id,
  buffer: buffer.toString('base64'),
  mimeType
});
```

---

## Adapting to Existing Projects

The code references generate standalone modules. When integrating into existing projects:

### If user has Prisma

Generate a Prisma schema alongside the SQL:

```prisma
model KnowledgeSource {
  id           String   @id @default(uuid()) @db.Uuid
  sourceType   String   @map("source_type")
  title        String
  fileName     String?  @map("file_name")
  // ... etc
  chunks       DocumentChunk[]

  @@map("knowledge_sources")
}

model DocumentChunk {
  id              String   @id @default(uuid()) @db.Uuid
  sourceId        String   @map("source_id") @db.Uuid
  content         String
  context         String?
  contentForSearch String? @map("content_for_search")
  chunkIndex      Int      @map("chunk_index")
  // Note: Prisma doesn't support pgvector natively
  // Use raw queries for embedding operations
  source          KnowledgeSource @relation(fields: [sourceId], references: [id])

  @@map("document_chunks")
}
```

**Important:** Prisma doesn't natively support `vector` or `tsvector` types. Use
`$queryRaw` for embedding inserts and searches. The Prisma schema is useful for
non-vector operations (CRUD, status updates, listing sources).

### If user has Drizzle

```typescript
import { pgTable, uuid, text, integer, timestamp, customType } from 'drizzle-orm/pg-core';

// Custom vector type for Drizzle
const vector = customType<{ data: number[] }>({
  dataType() { return 'vector(1536)'; },
  toDriver(value) { return `[${value.join(',')}]`; },
});

export const knowledgeSources = pgTable('knowledge_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceType: text('source_type').notNull(),
  title: text('title').notNull(),
  // ... etc
});

export const documentChunks = pgTable('document_chunks', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id').notNull().references(() => knowledgeSources.id),
  content: text('content').notNull(),
  context: text('context'),
  contentForSearch: text('content_for_search'),
  chunkIndex: integer('chunk_index').notNull(),
  embedding: vector('embedding'),
  // Note: Use sql`` for tsvector queries
});
```

### If user has existing route patterns

Match their conventions. If they use:
- Controller classes → wrap in a `KnowledgeController`
- Middleware patterns → follow their auth/validation middleware chain
- Response format → match their standard `{ success, data, error }` envelope
- Logging → use their logger (Winston, Pino, etc.)

### If user has NestJS

Generate as a module:

```
src/
  knowledge/
    knowledge.module.ts
    knowledge.controller.ts
    knowledge.service.ts      — wraps ingestion + query
    dto/
      upload-file.dto.ts
      search.dto.ts
    lib/
      chunker.ts
      embeddings.ts
      ...
```

---

## Testing

### Unit tests for chunking

```typescript
describe('chunkText', () => {
  it('should respect sentence boundaries', () => {
    const text = 'First sentence. Second sentence. Third sentence.';
    const chunks = chunkText(text, 30, 10);
    // No chunk should start mid-sentence
    chunks.forEach(c => {
      expect(c.content).toMatch(/^[A-Z]/); // starts with capital
    });
  });

  it('should handle short text', () => {
    const chunks = chunkText('Short.', 1000, 200);
    expect(chunks).toHaveLength(0); // < 50 chars, skipped
  });
});
```

### Integration test for search

```typescript
describe('ragQuery', () => {
  it('should return results for known content', async () => {
    // Seed a test document
    await ingestText('The refund policy allows returns within 7 days.', {
      title: 'Refund Policy'
    });

    const result = await ragQuery('What is the refund period?');
    expect(result.resultCount).toBeGreaterThan(0);
    expect(result.context).toContain('7 days');
  });
});
```
