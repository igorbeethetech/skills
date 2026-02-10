---
name: n8n-knowledge-base-rag
description: >
  Build complete knowledge base systems where users can add files (PDF, DOCX, TXT/MD),
  website URLs, and plain text — and an AI agent searches all of it via advanced RAG.
  Think of it as building Copilot Studio's "Knowledge" feature. Can generate EITHER n8n
  workflow JSONs OR application code (TypeScript/Python) depending on how the user is
  building their project. Applies state-of-the-art RAG techniques including contextual
  chunking, hybrid search (vector + BM25), reranking, and metadata filtering.
  Trigger this skill whenever the user mentions: knowledge base, RAG system, document
  ingestion, file upload for AI, vector search, AI agent with custom data, "like Copilot
  Studio Knowledge", embedding pipeline, semantic search, or any system where content is
  ingested and queried by an AI. Also trigger when the user is building an application
  that needs RAG capabilities, regardless of the tech stack.
---

# Knowledge Base RAG System Generator

Build a production-grade knowledge base — similar to Microsoft Copilot Studio's
"Knowledge" feature — where users add files, URLs, and text, and an AI agent uses
all of it as grounded context.

This skill supports **two output modes**:

- **n8n Mode** → Generates importable n8n workflow JSONs + SQL schema
- **Code Mode** → Generates application code (TypeScript or Python) + SQL schema

Both modes share the same RAG theory, database schema, and architectural principles.
The difference is in the implementation layer.

## Quick Reference: What to Read and When

| File | When to read |
|------|-------------|
| `references/rag-theory.md` | **Always read first.** Core RAG concepts, techniques, and decision framework |
| `references/sql-schema.md` | **Always.** Database schema (same for both modes) |
| `references/workflow-ingestion.md` | n8n Mode: ingestion workflows |
| `references/workflow-rag-query.md` | n8n Mode: AI agent query tool workflow |
| `references/n8n-patterns.md` | n8n Mode: n8n JSON structure and node configs |
| `references/code-ingestion.md` | Code Mode: ingestion service/API implementation |
| `references/code-rag-query.md` | Code Mode: RAG query service implementation |
| `references/code-patterns.md` | Code Mode: project structure, libraries, best practices |

## What This System Does

Users can add three types of knowledge sources:

1. **Files** — PDF, DOCX, TXT, MD
2. **URLs** — Websites scraped and indexed
3. **Text** — Plain text or HTML pasted directly

All content is processed through the same pipeline:

```
Source → Extract Text → Contextual Chunking → Hybrid Indexing → Ready for AI
                              ↓                      ↓
                    (context-enriched chunks)  (vector + BM25 indexes)
```

The AI queries this knowledge base using:

```
Question → Query Expansion → Hybrid Search (vector + BM25)
    → Rerank Results → Format Context → AI Response
```

## Step-by-Step Generation Process

### Step 1: Determine Output Mode

**This is the first and most important question.** Ask the user:

> "How do you want to build this system? I can generate:
>
> **A) n8n Workflows** — Importable JSON workflows for n8n. Best if you're building
>    automations with n8n and want to plug RAG into your AI Agent nodes.
>
> **B) Application Code** — TypeScript or Python services/APIs. Best if you're building
>    a custom application (Next.js, Express, FastAPI, etc.) and want to integrate RAG
>    directly into your codebase.
>
> Which approach fits your project?"

**How to infer the mode if not explicitly stated:**
- User mentions n8n, workflows, AI Agent node, webhooks → **n8n Mode**
- User mentions Next.js, Express, FastAPI, React, API routes, their app → **Code Mode**
- User is building a SaaS product → likely **Code Mode**
- User wants quick automation / chatbot → likely **n8n Mode**
- If ambiguous → **ask**

### Step 2: Gather Requirements

Ask (skip already answered):

**Common to both modes:**
1. **Database** — Supabase Cloud or self-hosted PostgreSQL?
2. **Source types** — Files / URLs / Text? Default: all three
3. **File types** — PDF, DOCX, TXT/MD? Default: all
4. **Multi-tenant** — Multiple clients/tenants? Default: no
5. **Embedding model** — Default: OpenAI `text-embedding-3-small` (1536d)
6. **RAG level** — Basic (vector-only) or Advanced (hybrid + contextual)? Default: Advanced
7. **Content language** — For BM25 config. Default: Portuguese

**n8n Mode specific:**
8. **n8n environment** — Self-hosted or cloud?
9. **Trigger type** — Webhook only, or also scheduled/event-driven?

**Code Mode specific:**
8. **Language** — TypeScript or Python?
9. **Framework** — Express, Next.js API Routes, FastAPI, NestJS, etc.?
10. **Existing project** — Adding to existing codebase or greenfield?
11. **ORM/DB client** — Prisma, Drizzle, Knex, pg, asyncpg, SQLAlchemy, etc.?

### Step 3: Read Theory

**Always read `references/rag-theory.md` first**, regardless of mode. This ensures
the system uses modern RAG techniques. Key concepts covered:

- Naive RAG → Advanced RAG → Modern RAG evolution
- Contextual chunking (Anthropic's technique, 49-67% retrieval improvement)
- Hybrid search (vector + BM25)
- Reranking with cross-encoders
- Query expansion and HyDE
- Common failure modes and fixes
- Decision framework: prototype vs production vs mission-critical

### Step 4: Generate SQL Schema

**Same for both modes.** Read `references/sql-schema.md`, then generate:

- `knowledge_sources` table (unified for files, URLs, text)
- `document_chunks` table (embedding + tsvector for hybrid search)
- `match_documents()` and `hybrid_search()` PostgreSQL functions
- HNSW + GIN indexes
- Optional: RLS, multi-tenant variant

### Step 5: Generate Implementation (mode-dependent)

#### If n8n Mode:

Read these references:
- `references/workflow-ingestion.md`
- `references/workflow-rag-query.md`
- `references/n8n-patterns.md`

Generate:
1. `schema.sql` — Database setup
2. `workflow-file-upload.json` — File ingestion
3. `workflow-url-scrape.json` — URL ingestion
4. `workflow-text-input.json` — Text ingestion
5. `workflow-rag-query.json` — AI agent query tool

#### If Code Mode:

Read these references:
- `references/code-ingestion.md`
- `references/code-rag-query.md`
- `references/code-patterns.md`

Generate project files based on user's stack. Typical output:

**TypeScript (Express/Next.js):**
```
schema.sql
src/
  lib/
    db.ts                  — Database connection
    embeddings.ts          — OpenAI embedding client
    chunker.ts             — Text chunking with sentence boundaries
    contextualizer.ts      — Contextual chunking via LLM
    text-extractors.ts     — PDF/DOCX/TXT extraction
    url-scraper.ts         — URL content extraction
  services/
    ingestion.service.ts   — Unified ingestion pipeline
    rag-query.service.ts   — Hybrid search + formatting
  routes/
    knowledge.routes.ts    — REST API endpoints
  types/
    knowledge.types.ts     — TypeScript interfaces
```

**Python (FastAPI):**
```
schema.sql
app/
  core/
    database.py            — Database connection
    embeddings.py          — OpenAI embedding client
    chunker.py             — Text chunking
    contextualizer.py      — Contextual chunking via LLM
    extractors.py          — PDF/DOCX/TXT extraction
    scraper.py             — URL content extraction
  services/
    ingestion.py           — Unified ingestion pipeline
    rag_query.py           — Hybrid search + formatting
  routes/
    knowledge.py           — FastAPI route handlers
  models/
    schemas.py             — Pydantic models
```

**Adapt to the user's existing project structure.** If they already have a `src/lib`
folder, follow their conventions. If they use Prisma, generate a Prisma schema
alongside the raw SQL. Match their patterns.

### Step 6: Deliver

Present the generated files with a brief setup guide.

**n8n Mode setup:**
1. Run `schema.sql` in Supabase SQL Editor / psql
2. Import workflow JSONs into n8n
3. Update credential IDs in all nodes
4. Test with sample upload

**Code Mode setup:**
1. Run `schema.sql`
2. Install dependencies (list them)
3. Set environment variables (DB URL, OpenAI key)
4. Integrate routes/services into existing app
5. Test with sample upload

## Customization Parameters (both modes)

| Parameter | Default | Notes |
|-----------|---------|-------|
| Embedding model | `text-embedding-3-small` | 1536 dims, best cost/quality |
| Chunk size | 800 tokens (~3200 chars) | Smaller = more precise |
| Chunk overlap | 200 tokens (~800 chars) | Prevents splitting ideas |
| Contextual chunking | Enabled | LLM enriches each chunk |
| Hybrid search | Enabled | Vector + BM25 combined |
| Reranking | Optional | Max precision, adds latency |
| Similarity threshold | 0.70 | Tune per use case |
| Max results | 10 retrieve → 5 return | Broad retrieval, precise return |
| Max file size | 10MB | Configurable |
| BM25 language | 'portuguese' | Match content language |
| Multi-tenant | Disabled | Adds tenant_id isolation |

## Architecture (both modes share this)

```
┌─────────────────────────────────────────────────────┐
│                 INGESTION LAYER                      │
│                                                      │
│  n8n Mode: Webhook workflows (JSON)                  │
│  Code Mode: REST API endpoints (Express/FastAPI)     │
│                                                      │
│  ┌─────────┐  ┌──────────┐  ┌──────────┐           │
│  │  Files   │  │   URLs   │  │   Text   │           │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘           │
│       └──────────────┼─────────────┘                 │
│                      ↓                               │
│     ┌──────────────────────────────────┐             │
│     │   Shared Processing Pipeline     │             │
│     │   Extract → Chunk → Contextualize│             │
│     │   → Embed → Store                │             │
│     └──────────────────────────────────┘             │
└──────────────────┬──────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────┐
│          STORAGE LAYER (PostgreSQL + pgvector)       │
│          (identical for both modes)                  │
│                                                      │
│  knowledge_sources  → source metadata + status       │
│  document_chunks    → text + embedding + tsvector    │
│  hybrid_search()    → vector + BM25 combined         │
└──────────────────┬──────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────┐
│                  QUERY LAYER                         │
│                                                      │
│  n8n Mode: Tool Workflow for AI Agent node           │
│  Code Mode: Service function / API endpoint          │
│                                                      │
│  Query → Embed → Hybrid Search → Rerank → Context    │
└─────────────────────────────────────────────────────┘
```
