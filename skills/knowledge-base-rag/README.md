# 🧠 Knowledge Base RAG Skill

> Generates complete Knowledge Base systems with advanced RAG — from zero to deploy.

Works like **Microsoft Copilot Studio's "Knowledge"** feature: users add files (PDF, DOCX, TXT), website URLs, and plain text, and an AI agent uses it all as a grounded knowledge base.

Generates **n8n workflows (JSON)** or **application code (TypeScript/Python)** — you choose.

---

## ✨ What does this skill do?

When you ask Claude to build a knowledge base or RAG system, this skill is automatically loaded and guides the generation of:

| Output | Description |
|--------|-------------|
| `schema.sql` | Complete database (PostgreSQL + pgvector) with hybrid search |
| n8n Workflows **or** Application Code | Ingestion pipeline + search service |
| Documentation | Setup guide for deployment |

### RAG techniques included

- ✅ **Contextual Chunking** — Each chunk is enriched with full-document context via LLM (Anthropic's technique, -67% retrieval failures)
- ✅ **Hybrid Search** — Vector (semantic) + BM25 (keyword) search combined
- ✅ **Reranking** — Optional re-ranking layer (Cohere, cross-encoder, Jina) for maximum precision
- ✅ **Query Expansion & HyDE** — Expands short queries and generates hypothetical answers for better recall
- ✅ **Advanced RAG Patterns** — Multi-Query Retrieval, Contextual Compression, Parent Document Retriever
- ✅ **Metadata Filtering** — Filter by category, source type, tenant
- ✅ **Multi-tenant** — Optional support for multiple clients/tenants
- ✅ **Evaluation Framework** — Built-in helpers to measure retrieval precision and hit rate

### Supported knowledge sources

| Type | Formats |
|------|---------|
| 📄 Files | PDF, DOCX, TXT, MD |
| 🔗 URLs | Any web page (automatic scraping) |
| 📝 Text | Plain text or HTML pasted directly |

---

## 🏗️ Architecture

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
│                                                      │
│  knowledge_sources  → metadata + status              │
│  document_chunks    → text + embedding + tsvector    │
│  hybrid_search()    → vector + BM25 combined         │
└──────────────────┬──────────────────────────────────┘
                   ↓
┌─────────────────────────────────────────────────────┐
│                  QUERY LAYER                         │
│                                                      │
│  n8n Mode: Tool Workflow for AI Agent                │
│  Code Mode: Service / API endpoint                   │
│                                                      │
│  Query → Embed → Hybrid Search → Rerank → Context    │
└─────────────────────────────────────────────────────┘
```

---

## 🚀 Usage

Once installed, just talk to Claude naturally. The skill activates automatically when it detects intent to build a RAG or knowledge base system.

**Example prompts that trigger the skill:**

```
"I need a system where users upload PDFs and an AI answers
based on those documents"

"Build a RAG with n8n and Supabase that accepts files, URLs, and text"

"I want to build something like Copilot Studio's Knowledge feature
using my own stack"

"Add a knowledge base feature to my Next.js project"

"I need a document ingestion pipeline with vector search"
```

Claude will:
1. Ask whether you want **n8n workflows** or **application code**
2. Gather your project requirements
3. Generate all necessary files (SQL, workflows/code, setup guide)

---

## 📁 Files

```
knowledge-base-rag/
├── SKILL.md                              ← Entry point (Claude reads first)
├── README.md                             ← This file
└── references/
    ├── rag-theory.md                     ← RAG theory & best practices (2026)
    ├── sql-schema.md                     ← PostgreSQL + pgvector schema
    ├── vector-stores.md                  ← Vector DB options (Pinecone, Weaviate, Chroma, Qdrant)
    ├── workflow-ingestion.md             ← [n8n] Ingestion workflows
    ├── workflow-rag-query.md             ← [n8n] RAG search workflow
    ├── n8n-patterns.md                   ← [n8n] JSON structure & node configs
    ├── code-ingestion.md                 ← [Code] Ingestion service (TS/Python)
    ├── code-rag-query.md                 ← [Code] Search service (TS/Python)
    └── code-patterns.md                  ← [Code] Project structure & patterns
```

Claude follows **progressive disclosure** — it only loads what it needs:

1. **Always reads:** `SKILL.md` + `rag-theory.md` + `sql-schema.md`
2. **If n8n Mode:** `workflow-ingestion.md`, `workflow-rag-query.md`, `n8n-patterns.md`
3. **If Code Mode:** `code-ingestion.md`, `code-rag-query.md`, `code-patterns.md`
4. **If non-pgvector store:** `vector-stores.md`

---

## ⚙️ Customizable Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| Embedding model | `text-embedding-3-small` | 1536d. Also: `text-embedding-3-large`, Voyage AI `voyage-3-large`, `bge-large-en-v1.5` |
| Chunk size | ~800 tokens | Smaller chunks = more precise retrieval |
| Overlap | ~200 tokens | Prevents splitting ideas across boundaries |
| Contextual chunking | ✅ Enabled | LLM enriches each chunk with context |
| Hybrid search | ✅ Enabled | Vector + BM25 combined |
| Reranking | Optional | Maximum precision, adds latency |
| Similarity threshold | 0.70 | Lower = more results, higher = more precise |
| BM25 language | `english` | Change to match your content language |
| Multi-tenant | Disabled | Enables tenant_id isolation |

---

## 🔧 Supported Tech Stack

### Vector Databases
- **pgvector** (PostgreSQL) — default, no extra infra
- **Pinecone** — managed serverless, zero ops
- **Weaviate** — multi-modal, GraphQL API
- **Chroma** — embedded, great for prototyping
- **Qdrant** — fast filtered search, Rust-based

### Embedding Models
- **OpenAI**: `text-embedding-3-small` (1536d), `text-embedding-3-large` (3072d)
- **Voyage AI**: `voyage-3-large` (1024d), `voyage-code-3` (1024d)
- **Open-source**: `bge-large-en-v1.5`, `multilingual-e5-large`

### n8n Mode
- **n8n** (self-hosted or cloud) + **Supabase** or PostgreSQL with pgvector + **OpenAI API**

### Code Mode
- **TypeScript**: Express, Next.js API Routes, NestJS
- **Python**: FastAPI, Flask
- **ORMs**: pg, Prisma, Drizzle, asyncpg, SQLAlchemy
- **Frameworks**: Custom code, LangChain, LangGraph
- **Supabase** or PostgreSQL with pgvector + **OpenAI API** (or Voyage AI)

---

## 📖 Deep Dive

The `references/rag-theory.md` file contains a comprehensive guide to modern RAG:

- The 3 generations of RAG (Naive → Advanced → Modern)
- Why contextual chunking reduces retrieval failures by 49-67%
- How hybrid search combines semantics + keywords
- When to use reranking and query expansion
- Advanced RAG patterns: Multi-Query, Contextual Compression, Parent Document, HyDE
- Vector database comparison: pgvector, Pinecone, Weaviate, Chroma, Qdrant
- Advanced chunking strategies: Token-based, Semantic, Markdown Header
- Prompt engineering for RAG: citation patterns, structured output
- Evaluation metrics and testing framework
- Common failure modes and how to fix them
- Decision framework: prototype vs production vs mission-critical

It serves both as a reference for Claude and as study material for developers.
