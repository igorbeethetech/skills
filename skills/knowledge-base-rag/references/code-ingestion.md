# Code Mode: Ingestion Service Reference

Implementation patterns for the ingestion pipeline in application code. Covers both
TypeScript and Python. The logic mirrors the n8n workflow but as composable functions.

## Table of Contents
1. [Architecture](#architecture)
2. [Text Extraction](#text-extraction)
3. [Chunking](#chunking)
4. [Contextual Chunking](#contextual-chunking)
5. [Embedding Generation](#embedding-generation)
6. [Storage](#storage)
7. [Unified Ingestion Pipeline](#unified-ingestion-pipeline)
8. [API Endpoints](#api-endpoints)

---

## Architecture

The ingestion service is a pipeline of composable functions:

```
extractText(source) → chunkText(text) → contextualizeChunks(chunks, fullText)
    → generateEmbeddings(chunks) → storeChunks(chunks) → updateSourceStatus()
```

Each function is independent and testable. The pipeline orchestrates them.

---

## Text Extraction

### TypeScript

```typescript
// text-extractors.ts
import pdf from 'pdf-parse';           // npm install pdf-parse
import mammoth from 'mammoth';          // npm install mammoth
import { Readable } from 'stream';

interface ExtractedText {
  text: string;
  pageCount?: number;
  metadata?: Record<string, unknown>;
}

export async function extractFromPDF(buffer: Buffer): Promise<ExtractedText> {
  const data = await pdf(buffer);
  return {
    text: data.text.trim(),
    pageCount: data.numpages,
    metadata: { info: data.info }
  };
}

export async function extractFromDOCX(buffer: Buffer): Promise<ExtractedText> {
  const result = await mammoth.extractRawText({ buffer });
  return { text: result.value.trim() };
}

export async function extractFromText(buffer: Buffer): Promise<ExtractedText> {
  return { text: buffer.toString('utf-8').trim() };
}

export async function extractText(
  buffer: Buffer,
  mimeType: string
): Promise<ExtractedText> {
  switch (mimeType) {
    case 'application/pdf':
      return extractFromPDF(buffer);
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return extractFromDOCX(buffer);
    case 'text/plain':
    case 'text/markdown':
      return extractFromText(buffer);
    default:
      throw new Error(`Unsupported file type: ${mimeType}`);
  }
}
```

### Python

```python
# extractors.py
import fitz  # pip install pymupdf
from docx import Document  # pip install python-docx
from dataclasses import dataclass
from typing import Optional

@dataclass
class ExtractedText:
    text: str
    page_count: Optional[int] = None
    metadata: Optional[dict] = None

def extract_from_pdf(content: bytes) -> ExtractedText:
    doc = fitz.open(stream=content, filetype="pdf")
    text = "\n".join(page.get_text() for page in doc)
    return ExtractedText(text=text.strip(), page_count=len(doc))

def extract_from_docx(content: bytes) -> ExtractedText:
    import io
    doc = Document(io.BytesIO(content))
    text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    return ExtractedText(text=text.strip())

def extract_from_text(content: bytes) -> ExtractedText:
    return ExtractedText(text=content.decode("utf-8").strip())

def extract_text(content: bytes, mime_type: str) -> ExtractedText:
    extractors = {
        "application/pdf": extract_from_pdf,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": extract_from_docx,
        "text/plain": extract_from_text,
        "text/markdown": extract_from_text,
    }
    extractor = extractors.get(mime_type)
    if not extractor:
        raise ValueError(f"Unsupported file type: {mime_type}")
    return extractor(content)
```

### URL Scraping

#### TypeScript
```typescript
// url-scraper.ts
import axios from 'axios';
import * as cheerio from 'cheerio';  // npm install cheerio

export async function scrapeUrl(url: string): Promise<string> {
  const response = await axios.get(url, {
    timeout: 30000,
    headers: { 'User-Agent': 'KnowledgeBaseBot/1.0' },
    maxRedirects: 5
  });

  const $ = cheerio.load(response.data);

  // Remove non-content elements
  $('script, style, nav, footer, header, aside, iframe').remove();

  // Get main content (try common selectors, fall back to body)
  const mainContent = $('main, article, [role="main"], .content, .post-content')
    .first().text()
    || $('body').text();

  // Clean whitespace
  return mainContent.replace(/\s+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();
}
```

#### Python
```python
# scraper.py
import httpx
from bs4 import BeautifulSoup  # pip install beautifulsoup4

async def scrape_url(url: str) -> str:
    async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
        response = await client.get(url, headers={"User-Agent": "KnowledgeBaseBot/1.0"})
        response.raise_for_status()

    soup = BeautifulSoup(response.text, "html.parser")

    for tag in soup(["script", "style", "nav", "footer", "header", "aside", "iframe"]):
        tag.decompose()

    main = soup.find("main") or soup.find("article") or soup.find("body")
    text = main.get_text(separator="\n", strip=True) if main else ""
    return text
```

---

## Chunking

### TypeScript

```typescript
// chunker.ts
export interface Chunk {
  content: string;
  chunkIndex: number;
  tokenEstimate: number;
}

export function chunkText(
  text: string,
  chunkSize: number = 3200,   // ~800 tokens
  overlap: number = 800        // ~200 tokens
): Chunk[] {
  const chunks: Chunk[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);

    // Try to break at sentence boundary
    if (end < text.length) {
      const window = text.slice(start + Math.floor(chunkSize * 0.7), end);
      const breaks = [...window.matchAll(/[.!?]\s/g)];
      if (breaks.length > 0) {
        const last = breaks[breaks.length - 1];
        end = start + Math.floor(chunkSize * 0.7) + last.index! + 2;
      }
    }

    const content = text.slice(start, end).trim();
    if (content.length > 50) {
      chunks.push({
        content,
        chunkIndex: chunks.length,
        tokenEstimate: Math.ceil(content.length / 4)
      });
    }

    start = end - overlap;
    if (start >= text.length || end >= text.length) break;
  }

  return chunks;
}
```

### Python

```python
# chunker.py
import re
from dataclasses import dataclass

@dataclass
class Chunk:
    content: str
    chunk_index: int
    token_estimate: int

def chunk_text(
    text: str,
    chunk_size: int = 3200,
    overlap: int = 800
) -> list[Chunk]:
    chunks = []
    start = 0

    while start < len(text):
        end = min(start + chunk_size, len(text))

        if end < len(text):
            window_start = start + int(chunk_size * 0.7)
            window = text[window_start:end]
            breaks = list(re.finditer(r'[.!?]\s', window))
            if breaks:
                last = breaks[-1]
                end = window_start + last.end()

        content = text[start:end].strip()
        if len(content) > 50:
            chunks.append(Chunk(
                content=content,
                chunk_index=len(chunks),
                token_estimate=len(content) // 4
            ))

        start = end - overlap
        if start >= len(text) or end >= len(text):
            break

    return chunks
```

---

## Contextual Chunking

The key technique: enrich each chunk with document-level context via an LLM call
before embedding. See `rag-theory.md` for why this matters.

### TypeScript

```typescript
// contextualizer.ts
import OpenAI from 'openai';  // npm install openai

const openai = new OpenAI();

const CONTEXT_PROMPT = `<document>
{document}
</document>

Here is the chunk we want to situate within the whole document:
<chunk>
{chunk}
</chunk>

Please give a short succinct context to situate this chunk within the overall document for the purposes of improving search retrieval of the chunk. Answer only with the succinct context and nothing else.`;

export async function contextualizeChunk(
  chunk: string,
  fullDocument: string
): Promise<string> {
  // Truncate document if too long (~6000 tokens)
  const maxChars = 24000;
  const doc = fullDocument.length > maxChars
    ? fullDocument.slice(0, maxChars) + '\n[... document truncated ...]'
    : fullDocument;

  const prompt = CONTEXT_PROMPT
    .replace('{document}', doc)
    .replace('{chunk}', chunk);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',  // Fast and cheap for context generation
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 200,
    temperature: 0
  });

  return response.choices[0]?.message?.content?.trim() || '';
}

export async function contextualizeChunks(
  chunks: Chunk[],
  fullDocument: string,
  concurrency: number = 5
): Promise<Array<Chunk & { context: string; contentForSearch: string }>> {
  // Process in batches for rate limiting
  const results = [];

  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency);
    const contexts = await Promise.all(
      batch.map(c => contextualizeChunk(c.content, fullDocument))
    );

    for (let j = 0; j < batch.length; j++) {
      const context = contexts[j];
      results.push({
        ...batch[j],
        context,
        contentForSearch: context
          ? `${context}\n\n${batch[j].content}`
          : batch[j].content
      });
    }
  }

  return results;
}
```

### Python

```python
# contextualizer.py
import asyncio
from openai import AsyncOpenAI  # pip install openai

client = AsyncOpenAI()

CONTEXT_PROMPT = """<document>
{document}
</document>

Here is the chunk we want to situate within the whole document:
<chunk>
{chunk}
</chunk>

Please give a short succinct context to situate this chunk within the overall document for the purposes of improving search retrieval of the chunk. Answer only with the succinct context and nothing else."""

async def contextualize_chunk(chunk: str, full_document: str) -> str:
    max_chars = 24000
    doc = full_document[:max_chars] + "\n[... truncated ...]" if len(full_document) > max_chars else full_document

    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": CONTEXT_PROMPT.format(document=doc, chunk=chunk)}],
        max_tokens=200,
        temperature=0
    )
    return response.choices[0].message.content.strip()

async def contextualize_chunks(
    chunks: list[Chunk],
    full_document: str,
    concurrency: int = 5
) -> list[dict]:
    semaphore = asyncio.Semaphore(concurrency)

    async def process(chunk: Chunk) -> dict:
        async with semaphore:
            context = await contextualize_chunk(chunk.content, full_document)
            content_for_search = f"{context}\n\n{chunk.content}" if context else chunk.content
            return {
                **vars(chunk),
                "context": context,
                "content_for_search": content_for_search
            }

    return await asyncio.gather(*[process(c) for c in chunks])
```

---

## Embedding Generation

### TypeScript

```typescript
// embeddings.ts
import OpenAI from 'openai';

const openai = new OpenAI();
const MODEL = 'text-embedding-3-small';
const BATCH_SIZE = 20;

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: MODEL,
    input: text
  });
  return response.data[0].embedding;
}

export async function generateEmbeddings(
  texts: string[]
): Promise<number[][]> {
  const embeddings: number[][] = [];

  // Process in batches
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const response = await openai.embeddings.create({
      model: MODEL,
      input: batch
    });
    embeddings.push(...response.data.map(d => d.embedding));

    // Small delay between batches for rate limiting
    if (i + BATCH_SIZE < texts.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  return embeddings;
}
```

### Python

```python
# embeddings.py
from openai import AsyncOpenAI

client = AsyncOpenAI()
MODEL = "text-embedding-3-small"
BATCH_SIZE = 20

async def generate_embedding(text: str) -> list[float]:
    response = await client.embeddings.create(model=MODEL, input=text)
    return response.data[0].embedding

async def generate_embeddings(texts: list[str]) -> list[list[float]]:
    embeddings = []
    for i in range(0, len(texts), BATCH_SIZE):
        batch = texts[i:i + BATCH_SIZE]
        response = await client.embeddings.create(model=MODEL, input=batch)
        embeddings.extend([d.embedding for d in response.data])
    return embeddings
```

---

## Storage

### TypeScript (using `pg` directly)

```typescript
// db.ts
import { Pool } from 'pg';  // npm install pg

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
});

export async function insertSource(data: {
  sourceType: 'file' | 'url' | 'text';
  title: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  sourceUrl?: string;
  category?: string;
  tags?: string[];
  description?: string;
}) {
  const result = await pool.query(
    `INSERT INTO knowledge_sources
     (source_type, title, file_name, file_size, mime_type, source_url, category, tags, description, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
     RETURNING id, title, status`,
    [data.sourceType, data.title, data.fileName, data.fileSize,
     data.mimeType, data.sourceUrl, data.category || 'general',
     data.tags || [], data.description || '']
  );
  return result.rows[0];
}

export async function insertChunk(data: {
  sourceId: string;
  content: string;
  context: string | null;
  contentForSearch: string;
  chunkIndex: number;
  embedding: number[];
  tokenCount: number;
  metadata?: Record<string, unknown>;
}) {
  const embeddingStr = `[${data.embedding.join(',')}]`;
  await pool.query(
    `INSERT INTO document_chunks
     (source_id, content, context, content_for_search, chunk_index, embedding, token_count, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::vector, $7, $8::jsonb)`,
    [data.sourceId, data.content, data.context, data.contentForSearch,
     data.chunkIndex, embeddingStr, data.tokenCount,
     JSON.stringify(data.metadata || {})]
  );
}

export async function updateSourceStatus(
  sourceId: string,
  status: 'processing' | 'completed' | 'failed',
  extra?: { chunkCount?: number; errorMessage?: string }
) {
  await pool.query(
    `UPDATE knowledge_sources
     SET status = $2, chunk_count = COALESCE($3, chunk_count),
         error_message = $4
     WHERE id = $1`,
    [sourceId, status, extra?.chunkCount, extra?.errorMessage]
  );
}
```

### Python (using asyncpg)

```python
# database.py
import asyncpg  # pip install asyncpg
import json, os

pool: asyncpg.Pool = None

async def init_db():
    global pool
    pool = await asyncpg.create_pool(os.environ["DATABASE_URL"])

async def insert_source(data: dict) -> dict:
    row = await pool.fetchrow("""
        INSERT INTO knowledge_sources
        (source_type, title, file_name, file_size, mime_type, source_url, category, tags, description, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
        RETURNING id, title, status
    """, data["source_type"], data["title"], data.get("file_name"),
        data.get("file_size"), data.get("mime_type"), data.get("source_url"),
        data.get("category", "general"), data.get("tags", []),
        data.get("description", ""))
    return dict(row)

async def insert_chunk(data: dict):
    embedding_str = f"[{','.join(str(x) for x in data['embedding'])}]"
    await pool.execute("""
        INSERT INTO document_chunks
        (source_id, content, context, content_for_search, chunk_index, embedding, token_count, metadata)
        VALUES ($1, $2, $3, $4, $5, $6::vector, $7, $8::jsonb)
    """, data["source_id"], data["content"], data.get("context"),
        data["content_for_search"], data["chunk_index"],
        embedding_str, data["token_count"],
        json.dumps(data.get("metadata", {})))

async def update_source_status(source_id: str, status: str, **kwargs):
    await pool.execute("""
        UPDATE knowledge_sources
        SET status = $2, chunk_count = COALESCE($3, chunk_count), error_message = $4
        WHERE id = $1
    """, source_id, status, kwargs.get("chunk_count"), kwargs.get("error_message"))
```

---

## Unified Ingestion Pipeline

This is the orchestrator function that ties everything together.

### TypeScript

```typescript
// ingestion.service.ts
import { extractText } from '../lib/text-extractors';
import { scrapeUrl } from '../lib/url-scraper';
import { chunkText } from '../lib/chunker';
import { contextualizeChunks } from '../lib/contextualizer';
import { generateEmbeddings } from '../lib/embeddings';
import { insertSource, insertChunk, updateSourceStatus } from '../lib/db';

interface IngestFileParams {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  category?: string;
  tags?: string[];
  description?: string;
}

export async function ingestFile(params: IngestFileParams) {
  // 1. Create source record
  const source = await insertSource({
    sourceType: 'file',
    title: params.fileName,
    fileName: params.fileName,
    fileSize: params.buffer.length,
    mimeType: params.mimeType,
    category: params.category,
    tags: params.tags,
    description: params.description
  });

  return processSource(source.id, async () => {
    const { text } = await extractText(params.buffer, params.mimeType);
    return text;
  });
}

export async function ingestUrl(url: string, metadata?: {
  title?: string; category?: string; tags?: string[];
}) {
  const source = await insertSource({
    sourceType: 'url',
    title: metadata?.title || url,
    sourceUrl: url,
    category: metadata?.category,
    tags: metadata?.tags
  });

  return processSource(source.id, () => scrapeUrl(url));
}

export async function ingestText(text: string, metadata?: {
  title?: string; category?: string; tags?: string[];
}) {
  const source = await insertSource({
    sourceType: 'text',
    title: metadata?.title || text.slice(0, 80) + '...',
    category: metadata?.category,
    tags: metadata?.tags
  });

  return processSource(source.id, async () => text);
}

// Shared pipeline
async function processSource(
  sourceId: string,
  getTextFn: () => Promise<string>
) {
  try {
    await updateSourceStatus(sourceId, 'processing');

    // Extract text
    const text = await getTextFn();
    if (!text || text.trim().length < 50) {
      throw new Error('Extracted text is too short or empty');
    }

    // Chunk
    const rawChunks = chunkText(text);

    // Contextualize (comment out for basic mode)
    const chunks = await contextualizeChunks(rawChunks, text);

    // Generate embeddings for all chunks
    const textsToEmbed = chunks.map(c => c.contentForSearch);
    const embeddings = await generateEmbeddings(textsToEmbed);

    // Store each chunk
    for (let i = 0; i < chunks.length; i++) {
      await insertChunk({
        sourceId,
        content: chunks[i].content,
        context: chunks[i].context,
        contentForSearch: chunks[i].contentForSearch,
        chunkIndex: chunks[i].chunkIndex,
        embedding: embeddings[i],
        tokenCount: chunks[i].tokenEstimate
      });
    }

    // Update source as completed
    await updateSourceStatus(sourceId, 'completed', {
      chunkCount: chunks.length
    });

    return { sourceId, status: 'completed', chunkCount: chunks.length };

  } catch (error) {
    await updateSourceStatus(sourceId, 'failed', {
      errorMessage: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}
```

---

## API Endpoints

### TypeScript (Express)

```typescript
// knowledge.routes.ts
import { Router } from 'express';
import multer from 'multer';  // npm install multer
import { ingestFile, ingestUrl, ingestText } from '../services/ingestion.service';

const router = Router();
const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/upload-file', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const result = await ingestFile({
      buffer: req.file.buffer,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      category: req.body.category,
      tags: req.body.tags?.split(',').map((t: string) => t.trim()),
      description: req.body.description
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/add-url', async (req, res) => {
  try {
    const { url, title, category, tags } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    const result = await ingestUrl(url, { title, category, tags: tags?.split(',') });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/add-text', async (req, res) => {
  try {
    const { content, title, category, tags } = req.body;
    if (!content) return res.status(400).json({ error: 'Content is required' });
    const result = await ingestText(content, { title, category, tags: tags?.split(',') });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
```

### Python (FastAPI)

```python
# routes/knowledge.py
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from typing import Optional

router = APIRouter(prefix="/kb")

@router.post("/upload-file")
async def upload_file(
    file: UploadFile = File(...),
    category: Optional[str] = Form("general"),
    tags: Optional[str] = Form(""),
    description: Optional[str] = Form("")
):
    content = await file.read()
    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []
    result = await ingest_file(
        content=content, file_name=file.filename,
        mime_type=file.content_type, category=category,
        tags=tag_list, description=description
    )
    return result

@router.post("/add-url")
async def add_url(data: dict):
    if not data.get("url"):
        raise HTTPException(400, "URL is required")
    return await ingest_url(data["url"], data)

@router.post("/add-text")
async def add_text(data: dict):
    if not data.get("content"):
        raise HTTPException(400, "Content is required")
    return await ingest_text(data["content"], data)
```

---

## Dependencies Summary

### TypeScript
```json
{
  "dependencies": {
    "pg": "^8.12",
    "openai": "^4.60",
    "pdf-parse": "^1.1",
    "mammoth": "^1.8",
    "cheerio": "^1.0",
    "axios": "^1.7",
    "multer": "^1.4",
    "express": "^4.19"
  }
}
```

### Python
```
asyncpg>=0.29
openai>=1.50
pymupdf>=1.24
python-docx>=1.1
beautifulsoup4>=4.12
httpx>=0.27
fastapi>=0.115
python-multipart>=0.0.12
```
