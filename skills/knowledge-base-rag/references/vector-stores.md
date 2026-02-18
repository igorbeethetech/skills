# Vector Store Options & Configuration

Reference for setting up different vector databases. The skill defaults to **pgvector** (PostgreSQL)
because it requires no additional infrastructure, but other stores may be better depending on
scale, team, and requirements.

## Table of Contents
1. [Decision Matrix](#decision-matrix)
2. [pgvector (Default)](#pgvector-default)
3. [Pinecone](#pinecone)
4. [Weaviate](#weaviate)
5. [Chroma](#chroma)
6. [Qdrant](#qdrant)
7. [Migration Patterns](#migration-patterns)

---

## Decision Matrix

| Factor | pgvector | Pinecone | Weaviate | Chroma | Qdrant |
|--------|----------|----------|----------|--------|--------|
| **Setup complexity** | Low (SQL extension) | Low (managed) | Medium | Very Low | Medium |
| **Ops burden** | Use existing PG | Zero (serverless) | Self-host or cloud | None (embedded) | Self-host or cloud |
| **Max vectors** | ~5M (single node) | Billions | Billions | ~1M | Billions |
| **Hybrid search** | Built-in (tsvector) | Sparse vectors | BM25 built-in | Metadata only | Payload filtering |
| **Cost** | Free (your PG) | Pay per vector | Free (self-host) | Free | Free (self-host) |
| **n8n integration** | Supabase node | Pinecone node | Weaviate node | Not native | Not native |
| **Best for** | Default, Supabase, < 5M vectors | Zero-ops, massive scale | Multi-modal, GraphQL | Prototyping, local dev | Fast filtered search |

### Quick Decision Guide

- **Already using Supabase/PostgreSQL?** → pgvector (no extra infra)
- **Want zero infrastructure management?** → Pinecone Serverless
- **Need multi-modal search (text + images)?** → Weaviate
- **Just prototyping locally?** → Chroma
- **Need fast filtered search at scale?** → Qdrant
- **Using n8n?** → pgvector (Supabase node) or Pinecone (native node)

---

## pgvector (Default)

pgvector is the default because it uses your existing PostgreSQL database. No extra services needed.

**Setup:** See `references/sql-schema.md` for the complete schema with hybrid search functions.

### n8n Integration
Uses the **Supabase** node for storage and retrieval. The ingestion and query workflows in
`references/workflow-ingestion.md` and `references/workflow-rag-query.md` use Supabase nodes
that connect directly to pgvector tables.

### Code Integration
Uses `pg` (TypeScript) or `asyncpg` (Python) directly. See `references/code-ingestion.md`
and `references/code-rag-query.md` for complete implementations.

### LangChain Integration

#### TypeScript
```typescript
import { SupabaseVectorStore } from '@langchain/community/vectorstores/supabase';
import { OpenAIEmbeddings } from '@langchain/openai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const vectorStore = new SupabaseVectorStore(
  new OpenAIEmbeddings({ modelName: 'text-embedding-3-small' }),
  {
    client: supabase,
    tableName: 'document_chunks',
    queryName: 'match_documents',
  }
);

// Add documents
await vectorStore.addDocuments(documents);

// Search
const results = await vectorStore.similaritySearch('query', 5);
```

#### Python
```python
from langchain_community.vectorstores import SupabaseVectorStore
from langchain_openai import OpenAIEmbeddings
from supabase import create_client

supabase = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_KEY"]
)

vector_store = SupabaseVectorStore(
    embedding=OpenAIEmbeddings(model="text-embedding-3-small"),
    client=supabase,
    table_name="document_chunks",
    query_name="match_documents",
)
```

---

## Pinecone

Managed vector database with serverless option. Zero infrastructure management.

### Setup

#### TypeScript
```typescript
import { Pinecone } from '@pinecone-database/pinecone';

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });

// Create index (run once)
await pinecone.createIndex({
  name: 'knowledge-base',
  dimension: 1536,  // Match your embedding model
  metric: 'cosine',
  spec: { serverless: { cloud: 'aws', region: 'us-east-1' } }
});

const index = pinecone.index('knowledge-base');

// Upsert vectors
await index.upsert([
  {
    id: chunkId,
    values: embedding,
    metadata: {
      sourceId, sourceTitle, sourceType, content, category,
      chunkIndex, tenantId  // All filterable
    }
  }
]);

// Query
const results = await index.query({
  vector: queryEmbedding,
  topK: 10,
  filter: { category: { $eq: 'policies' } },
  includeMetadata: true
});
```

#### Python
```python
from pinecone import Pinecone, ServerlessSpec

pc = Pinecone(api_key=os.environ["PINECONE_API_KEY"])

# Create index (run once)
pc.create_index(
    name="knowledge-base",
    dimension=1536,
    metric="cosine",
    spec=ServerlessSpec(cloud="aws", region="us-east-1")
)

index = pc.Index("knowledge-base")

# Upsert
index.upsert(vectors=[
    {"id": chunk_id, "values": embedding, "metadata": {
        "source_id": source_id, "content": content, "category": category
    }}
])

# Query
results = index.query(
    vector=query_embedding, top_k=10,
    filter={"category": {"$eq": "policies"}},
    include_metadata=True
)
```

### LangChain Integration

```typescript
import { PineconeStore } from '@langchain/pinecone';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Pinecone } from '@pinecone-database/pinecone';

const pinecone = new Pinecone();
const index = pinecone.index('knowledge-base');

const vectorStore = await PineconeStore.fromExistingIndex(
  new OpenAIEmbeddings({ modelName: 'text-embedding-3-small' }),
  { pineconeIndex: index }
);
```

```python
from langchain_pinecone import PineconeVectorStore
from langchain_openai import OpenAIEmbeddings

vector_store = PineconeVectorStore(
    index_name="knowledge-base",
    embedding=OpenAIEmbeddings(model="text-embedding-3-small")
)
```

### n8n Integration
Use the **Pinecone Vector Store** node in n8n. Available in both insert and retrieve modes.
Configure with your Pinecone API key credential and index name.

### Hybrid Search Note
Pinecone supports sparse-dense (hybrid) search via sparse vectors. You'd generate sparse
vectors using a BM25 encoder alongside dense embeddings. This is more complex than pgvector's
built-in tsvector approach.

---

## Weaviate

Open-source vector database with GraphQL API. Supports multi-modal search.

### Setup

#### TypeScript
```typescript
import weaviate from 'weaviate-ts-client';

const client = weaviate.client({
  scheme: 'http',
  host: 'localhost:8080',  // or Weaviate Cloud URL
});

// Create schema
await client.schema.classCreator().withClass({
  class: 'DocumentChunk',
  vectorizer: 'none',  // We provide our own embeddings
  properties: [
    { name: 'content', dataType: ['text'] },
    { name: 'sourceTitle', dataType: ['string'] },
    { name: 'sourceType', dataType: ['string'] },
    { name: 'category', dataType: ['string'] },
    { name: 'chunkIndex', dataType: ['int'] },
    { name: 'sourceId', dataType: ['string'] },
  ],
}).do();

// Insert with vector
await client.data.creator()
  .withClassName('DocumentChunk')
  .withProperties({ content, sourceTitle, sourceType, category, chunkIndex, sourceId })
  .withVector(embedding)
  .do();

// Search
const result = await client.graphql.get()
  .withClassName('DocumentChunk')
  .withFields('content sourceTitle sourceType category _additional { distance }')
  .withNearVector({ vector: queryEmbedding })
  .withLimit(10)
  .withWhere({
    path: ['category'],
    operator: 'Equal',
    valueString: 'policies'
  })
  .do();
```

#### Python
```python
import weaviate

client = weaviate.Client("http://localhost:8080")

# Create class
client.schema.create_class({
    "class": "DocumentChunk",
    "vectorizer": "none",
    "properties": [
        {"name": "content", "dataType": ["text"]},
        {"name": "sourceTitle", "dataType": ["string"]},
        {"name": "sourceType", "dataType": ["string"]},
        {"name": "category", "dataType": ["string"]},
    ]
})

# Insert
client.data_object.create(
    data_object={"content": content, "sourceTitle": title, "category": category},
    class_name="DocumentChunk",
    vector=embedding
)

# Search
result = client.query.get("DocumentChunk", ["content", "sourceTitle"]) \
    .with_near_vector({"vector": query_embedding}) \
    .with_limit(10) \
    .with_where({"path": ["category"], "operator": "Equal", "valueString": "policies"}) \
    .do()
```

### Built-in BM25
Weaviate has native BM25 search via `withBm25()` and hybrid search via `withHybrid()`:
```python
# Hybrid search (vector + BM25)
result = client.query.get("DocumentChunk", ["content", "sourceTitle"]) \
    .with_hybrid(query="refund policy", alpha=0.7) \
    .with_limit(10) \
    .do()
```

---

## Chroma

Embedded vector database -- runs in-process. Great for prototyping and local development.

### Setup

#### TypeScript
```typescript
import { ChromaClient } from 'chromadb';

const chroma = new ChromaClient();

// Create collection
const collection = await chroma.getOrCreateCollection({
  name: 'knowledge-base',
  metadata: { 'hnsw:space': 'cosine' }
});

// Add documents
await collection.add({
  ids: [chunkId],
  embeddings: [embedding],
  documents: [content],
  metadatas: [{ sourceId, sourceTitle, sourceType, category }]
});

// Query
const results = await collection.query({
  queryEmbeddings: [queryEmbedding],
  nResults: 10,
  where: { category: 'policies' }
});
```

#### Python
```python
import chromadb

client = chromadb.Client()  # In-memory
# Or persistent: chromadb.PersistentClient(path="./chroma_data")

collection = client.get_or_create_collection(
    name="knowledge-base",
    metadata={"hnsw:space": "cosine"}
)

# Add
collection.add(
    ids=[chunk_id],
    embeddings=[embedding],
    documents=[content],
    metadatas=[{"source_id": source_id, "category": category}]
)

# Query
results = collection.query(
    query_embeddings=[query_embedding],
    n_results=10,
    where={"category": "policies"}
)
```

### LangChain Integration

```python
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings

vector_store = Chroma(
    collection_name="knowledge-base",
    embedding_function=OpenAIEmbeddings(model="text-embedding-3-small"),
    persist_directory="./chroma_data"
)
```

### Limitations
- Not recommended for production with > 1M vectors
- No built-in hybrid/BM25 search (metadata filtering only)
- No built-in replication or high availability

---

## Qdrant

High-performance vector database written in Rust. Excellent for filtered search.

### Setup

#### TypeScript
```typescript
import { QdrantClient } from '@qdrant/js-client-rest';

const qdrant = new QdrantClient({ url: 'http://localhost:6333' });

// Create collection
await qdrant.createCollection('knowledge-base', {
  vectors: { size: 1536, distance: 'Cosine' }
});

// Create payload index for fast filtering
await qdrant.createPayloadIndex('knowledge-base', {
  field_name: 'category',
  field_schema: 'keyword'
});

// Upsert
await qdrant.upsert('knowledge-base', {
  points: [{
    id: chunkId,
    vector: embedding,
    payload: { content, sourceId, sourceTitle, sourceType, category, chunkIndex }
  }]
});

// Search with filter
const results = await qdrant.search('knowledge-base', {
  vector: queryEmbedding,
  limit: 10,
  filter: {
    must: [{ key: 'category', match: { value: 'policies' } }]
  },
  with_payload: true
});
```

#### Python
```python
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue

client = QdrantClient("localhost", port=6333)

# Create collection
client.create_collection(
    collection_name="knowledge-base",
    vectors_config=VectorParams(size=1536, distance=Distance.COSINE)
)

# Upsert
client.upsert("knowledge-base", points=[
    PointStruct(
        id=chunk_id, vector=embedding,
        payload={"content": content, "source_id": source_id, "category": category}
    )
])

# Search
results = client.search(
    collection_name="knowledge-base",
    query_vector=query_embedding,
    limit=10,
    query_filter=Filter(must=[
        FieldCondition(key="category", match=MatchValue(value="policies"))
    ])
)
```

### LangChain Integration

```python
from langchain_qdrant import QdrantVectorStore
from langchain_openai import OpenAIEmbeddings

vector_store = QdrantVectorStore.from_existing_collection(
    embedding=OpenAIEmbeddings(model="text-embedding-3-small"),
    collection_name="knowledge-base",
    url="http://localhost:6333"
)
```

---

## Migration Patterns

### Migrating from one vector store to another

The general pattern is: re-embed everything. Vector stores use different internal formats,
so you can't transfer raw vectors between systems reliably. However, if you stored your
embeddings in the original store's metadata, you can avoid re-embedding.

### Recommended Migration Approach

```python
# Generic migration script
async def migrate_vectors(source_store, target_store, batch_size=100):
    """Migrate from any store to another. Reads chunks from DB, re-embeds, inserts."""

    # 1. Read all chunks from source database
    chunks = await db.fetch("SELECT * FROM document_chunks ORDER BY created_at")

    # 2. Process in batches
    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i + batch_size]
        texts = [c["content_for_search"] for c in batch]

        # 3. Generate embeddings (or reuse if compatible)
        embeddings = await generate_embeddings(texts)

        # 4. Insert into target store
        await target_store.add(
            ids=[str(c["id"]) for c in batch],
            embeddings=embeddings,
            documents=texts,
            metadatas=[{
                "source_id": str(c["source_id"]),
                "chunk_index": c["chunk_index"],
                "category": c.get("category", "general")
            } for c in batch]
        )

    print(f"Migrated {len(chunks)} chunks")
```

### Abstraction Layer

If you anticipate switching stores, use a simple abstraction:

```typescript
interface VectorStore {
  addDocuments(docs: { id: string; text: string; embedding: number[]; metadata: Record<string, any> }[]): Promise<void>;
  search(embedding: number[], topK: number, filter?: Record<string, any>): Promise<SearchResult[]>;
  delete(ids: string[]): Promise<void>;
}

// Then implement for each store:
class PgVectorStore implements VectorStore { ... }
class PineconeVectorStore implements VectorStore { ... }
class QdrantVectorStore implements VectorStore { ... }
```

This lets you swap stores without changing your ingestion or query logic.
