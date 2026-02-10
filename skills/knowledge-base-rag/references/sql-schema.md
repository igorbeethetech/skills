# SQL Schema Reference — Knowledge Base with Hybrid Search

## Table of Contents
1. [Extensions](#extensions)
2. [Core Tables](#core-tables)
3. [Vector Search Function](#vector-search-function)
4. [Hybrid Search Function](#hybrid-search-function)
5. [Indexes](#indexes)
6. [RLS Policies](#rls-policies)
7. [Multi-tenant Variant](#multi-tenant-variant)
8. [Utility Functions](#utility-functions)

---

## Extensions

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

---

## Core Tables

### knowledge_sources

Unified table for all content types: files, URLs, and text. This replaces the old
`uploaded_files` concept with a source-agnostic design.

```sql
CREATE TABLE IF NOT EXISTS knowledge_sources (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Source type and identification
    source_type TEXT NOT NULL CHECK (source_type IN ('file', 'url', 'text')),
    title TEXT NOT NULL,                    -- Display name
    
    -- File-specific fields (NULL for url/text)
    file_name TEXT,
    file_size INTEGER,
    mime_type TEXT,
    
    -- URL-specific fields (NULL for file/text)
    source_url TEXT,
    
    -- Shared metadata
    category TEXT DEFAULT 'general',
    tags TEXT[] DEFAULT '{}',
    description TEXT DEFAULT '',
    
    -- Processing state
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_message TEXT,
    chunk_count INTEGER DEFAULT 0,
    
    -- Content hash for deduplication
    content_hash TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_updated_at_knowledge_sources
    BEFORE UPDATE ON knowledge_sources
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### document_chunks

Stores text chunks with BOTH vector embeddings (for semantic search) and tsvector
(for BM25 keyword search). This is the core of hybrid search.

```sql
CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID NOT NULL REFERENCES knowledge_sources(id) ON DELETE CASCADE,
    
    -- Content
    content TEXT NOT NULL,               -- The actual chunk text
    context TEXT,                         -- Contextual summary (from contextual chunking)
    content_for_search TEXT,             -- context + content combined (what gets embedded)
    
    -- Position
    chunk_index INTEGER NOT NULL,
    
    -- Embeddings (semantic search)
    embedding VECTOR(1536),              -- Adjust dimension to match your model
    
    -- Full-text search (BM25)
    -- IMPORTANT: Change 'portuguese' to match your content language
    search_vector TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('portuguese', COALESCE(content_for_search, content))
    ) STORED,
    
    -- Metadata
    token_count INTEGER,
    metadata JSONB DEFAULT '{}',
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Key design decisions:**
- `content` stores the original chunk (for display to users)
- `context` stores the contextual summary from the LLM
- `content_for_search` = `context` + `content` combined (what gets embedded AND indexed)
- `search_vector` is auto-generated from `content_for_search` for BM25 search
- Both the embedding AND the tsvector benefit from contextual enrichment

**Adapting the text search language:**
Change `'portuguese'` to match your content:
- `'english'` for English content
- `'portuguese'` for Portuguese content
- `'simple'` for multi-language content (basic stemming)
- `'spanish'`, `'french'`, `'german'`, etc.

---

## Vector Search Function

Pure vector similarity search. Use when you only need semantic matching.

```sql
CREATE OR REPLACE FUNCTION match_documents(
    query_embedding VECTOR(1536),
    match_threshold FLOAT DEFAULT 0.70,
    match_count INT DEFAULT 10,
    filter_category TEXT DEFAULT NULL,
    filter_source_id UUID DEFAULT NULL,
    filter_source_type TEXT DEFAULT NULL
)
RETURNS TABLE (
    chunk_id UUID,
    source_id UUID,
    source_title TEXT,
    source_type TEXT,
    content TEXT,
    context TEXT,
    chunk_index INTEGER,
    metadata JSONB,
    similarity FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT
        dc.id AS chunk_id,
        dc.source_id,
        ks.title AS source_title,
        ks.source_type,
        dc.content,
        dc.context,
        dc.chunk_index,
        dc.metadata,
        1 - (dc.embedding <=> query_embedding) AS similarity
    FROM document_chunks dc
    JOIN knowledge_sources ks ON ks.id = dc.source_id
    WHERE ks.status = 'completed'
        AND 1 - (dc.embedding <=> query_embedding) > match_threshold
        AND (filter_category IS NULL OR ks.category = filter_category)
        AND (filter_source_id IS NULL OR dc.source_id = filter_source_id)
        AND (filter_source_type IS NULL OR ks.source_type = filter_source_type)
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
```

---

## Hybrid Search Function

Combines vector similarity with BM25 keyword matching using weighted score fusion.
This is the recommended search function for production systems.

**Weighting rationale:** Anthropic's research found a 4:1 ratio (vector:BM25) works best.
We use 0.7:0.3 which is equivalent. Adjust if your content is more keyword-dependent.

```sql
CREATE OR REPLACE FUNCTION hybrid_search(
    query_embedding VECTOR(1536),
    query_text TEXT,
    match_count INT DEFAULT 10,
    vector_weight FLOAT DEFAULT 0.7,
    bm25_weight FLOAT DEFAULT 0.3,
    filter_category TEXT DEFAULT NULL,
    filter_source_type TEXT DEFAULT NULL,
    -- Change 'portuguese' to match your content language
    search_language TEXT DEFAULT 'portuguese'
)
RETURNS TABLE (
    chunk_id UUID,
    source_id UUID,
    source_title TEXT,
    source_type TEXT,
    content TEXT,
    context TEXT,
    chunk_index INTEGER,
    metadata JSONB,
    vector_similarity FLOAT,
    text_rank FLOAT,
    combined_score FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT
        dc.id AS chunk_id,
        dc.source_id,
        ks.title AS source_title,
        ks.source_type,
        dc.content,
        dc.context,
        dc.chunk_index,
        dc.metadata,
        (1 - (dc.embedding <=> query_embedding))::FLOAT AS vector_similarity,
        COALESCE(
            ts_rank_cd(
                dc.search_vector,
                plainto_tsquery(search_language::regconfig, query_text)
            ),
            0
        )::FLOAT AS text_rank,
        (
            vector_weight * (1 - (dc.embedding <=> query_embedding)) +
            bm25_weight * COALESCE(
                ts_rank_cd(
                    dc.search_vector,
                    plainto_tsquery(search_language::regconfig, query_text)
                ),
                0
            )
        )::FLOAT AS combined_score
    FROM document_chunks dc
    JOIN knowledge_sources ks ON ks.id = dc.source_id
    WHERE ks.status = 'completed'
        AND (filter_category IS NULL OR ks.category = filter_category)
        AND (filter_source_type IS NULL OR ks.source_type = filter_source_type)
        AND (
            -- Match via vector similarity OR keyword match
            (1 - (dc.embedding <=> query_embedding)) > 0.5
            OR dc.search_vector @@ plainto_tsquery(search_language::regconfig, query_text)
        )
    ORDER BY combined_score DESC
    LIMIT match_count;
END;
$$;
```

**How the hybrid function works:**
1. Casts a wide net: includes results that match EITHER vector similarity (>0.5) OR
   keyword match (BM25)
2. Scores each result with a weighted combination of both signals
3. Returns sorted by combined score

The BM25 component catches exact keyword matches that vectors miss (product codes,
names, acronyms), while the vector component catches semantic matches that keywords
miss ("happy" ↔ "joyful").

---

## Indexes

```sql
-- HNSW index for vector similarity (faster than IVFFlat, no training needed)
CREATE INDEX IF NOT EXISTS idx_chunks_embedding
    ON document_chunks
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- GIN index for full-text search (BM25)
CREATE INDEX IF NOT EXISTS idx_chunks_search_vector
    ON document_chunks
    USING gin (search_vector);

-- B-tree indexes for common filters
CREATE INDEX IF NOT EXISTS idx_chunks_source_id
    ON document_chunks(source_id);

CREATE INDEX IF NOT EXISTS idx_sources_status
    ON knowledge_sources(status);

CREATE INDEX IF NOT EXISTS idx_sources_category
    ON knowledge_sources(category);

CREATE INDEX IF NOT EXISTS idx_sources_type
    ON knowledge_sources(source_type);

CREATE INDEX IF NOT EXISTS idx_sources_created
    ON knowledge_sources(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sources_content_hash
    ON knowledge_sources(content_hash);
```

**Index selection rationale:**
- **HNSW** (Hierarchical Navigable Small World): Best for dynamic data. Unlike IVFFlat,
  doesn't require training and handles inserts well. The `m=16, ef_construction=64`
  parameters balance recall and build speed.
- **GIN**: Standard PostgreSQL index for full-text search. Enables fast `@@` matching.

---

## RLS Policies

Generate only for Supabase deployments:

```sql
ALTER TABLE knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- n8n uses service_role key — full access
CREATE POLICY "Service role full access on sources"
    ON knowledge_sources FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on chunks"
    ON document_chunks FOR ALL
    USING (auth.role() = 'service_role');

-- Authenticated users can read completed sources
CREATE POLICY "Auth users read completed sources"
    ON knowledge_sources FOR SELECT
    USING (auth.role() = 'authenticated' AND status = 'completed');

CREATE POLICY "Auth users read chunks of completed sources"
    ON document_chunks FOR SELECT
    USING (
        auth.role() = 'authenticated'
        AND source_id IN (SELECT id FROM knowledge_sources WHERE status = 'completed')
    );
```

---

## Multi-tenant Variant

When serving multiple tenants, add isolation:

```sql
ALTER TABLE knowledge_sources ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL;
ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sources_tenant ON knowledge_sources(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chunks_tenant ON document_chunks(tenant_id);

-- Multi-tenant hybrid search
CREATE OR REPLACE FUNCTION hybrid_search_tenant(
    query_embedding VECTOR(1536),
    query_text TEXT,
    p_tenant_id UUID,
    match_count INT DEFAULT 10,
    vector_weight FLOAT DEFAULT 0.7,
    bm25_weight FLOAT DEFAULT 0.3,
    search_language TEXT DEFAULT 'portuguese'
)
RETURNS TABLE (
    chunk_id UUID,
    source_id UUID,
    source_title TEXT,
    source_type TEXT,
    content TEXT,
    context TEXT,
    chunk_index INTEGER,
    metadata JSONB,
    vector_similarity FLOAT,
    text_rank FLOAT,
    combined_score FLOAT
)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT
        dc.id AS chunk_id,
        dc.source_id,
        ks.title AS source_title,
        ks.source_type,
        dc.content,
        dc.context,
        dc.chunk_index,
        dc.metadata,
        (1 - (dc.embedding <=> query_embedding))::FLOAT,
        COALESCE(ts_rank_cd(dc.search_vector, plainto_tsquery(search_language::regconfig, query_text)), 0)::FLOAT,
        (vector_weight * (1 - (dc.embedding <=> query_embedding)) +
         bm25_weight * COALESCE(ts_rank_cd(dc.search_vector, plainto_tsquery(search_language::regconfig, query_text)), 0))::FLOAT
    FROM document_chunks dc
    JOIN knowledge_sources ks ON ks.id = dc.source_id
    WHERE ks.status = 'completed'
        AND ks.tenant_id = p_tenant_id
        AND dc.tenant_id = p_tenant_id
        AND (
            (1 - (dc.embedding <=> query_embedding)) > 0.5
            OR dc.search_vector @@ plainto_tsquery(search_language::regconfig, query_text)
        )
    ORDER BY combined_score DESC
    LIMIT match_count;
END;
$$;
```

---

## Utility Functions

```sql
-- Delete a source and all its chunks (cascades via FK)
CREATE OR REPLACE FUNCTION delete_source(p_source_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM knowledge_sources WHERE id = p_source_id;
END;
$$;

-- Reset a source for reprocessing
CREATE OR REPLACE FUNCTION reset_source(p_source_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
    DELETE FROM document_chunks WHERE source_id = p_source_id;
    UPDATE knowledge_sources
    SET status = 'pending', chunk_count = 0, error_message = NULL
    WHERE id = p_source_id;
END;
$$;

-- Get knowledge base stats
CREATE OR REPLACE FUNCTION kb_stats()
RETURNS TABLE (
    total_sources BIGINT,
    completed_sources BIGINT,
    total_chunks BIGINT,
    sources_by_type JSONB
)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT AS total_sources,
        COUNT(*) FILTER (WHERE status = 'completed')::BIGINT AS completed_sources,
        (SELECT COUNT(*) FROM document_chunks)::BIGINT AS total_chunks,
        (
            SELECT jsonb_object_agg(source_type, cnt)
            FROM (
                SELECT source_type, COUNT(*) as cnt
                FROM knowledge_sources
                GROUP BY source_type
            ) sub
        ) AS sources_by_type
    FROM knowledge_sources;
END;
$$;
```
