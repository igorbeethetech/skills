# RAG Theory & Best Practices (2025)

This reference teaches the foundational concepts and modern techniques for building
production-grade RAG systems. Read this before generating any code — it ensures every
decision in the pipeline is intentional, not just "the default".

## Table of Contents
1. [What RAG Actually Is](#what-rag-actually-is)
2. [The Three Generations of RAG](#the-three-generations-of-rag)
3. [Chunking: The Foundation of Everything](#chunking-the-foundation-of-everything)
4. [Contextual Chunking: The Breakthrough](#contextual-chunking-the-breakthrough)
5. [Embedding Models: Choosing Wisely](#embedding-models-choosing-wisely)
6. [Retrieval Strategies](#retrieval-strategies)
7. [Reranking: The Precision Layer](#reranking-the-precision-layer)
8. [Query Optimization](#query-optimization)
9. [The Full Pipeline: Ingestion vs Query Time](#the-full-pipeline)
10. [Common Failure Modes & How to Avoid Them](#common-failure-modes)
11. [Decision Framework: When to Use What](#decision-framework)

---

## What RAG Actually Is

RAG (Retrieval-Augmented Generation) is not just "vector search + LLM". It's an
architecture pattern where an AI model's responses are grounded in specific, retrieved
documents rather than relying solely on training data. The core loop:

1. **User asks a question**
2. **System retrieves relevant content** from a knowledge base
3. **LLM generates a response** using that content as context
4. **Response is grounded** — the AI answers based on YOUR data, not general knowledge

Without RAG, the LLM guesses. With RAG, it reads then answers.

The key insight: **retrieval quality determines everything**. A perfect LLM with bad
retrieval produces hallucinations. A mediocre LLM with excellent retrieval produces
accurate, useful answers.

---

## The Three Generations of RAG

### Naive RAG (2023)
- Chunk documents into fixed-size pieces
- Embed each chunk independently
- On query: embed query → vector similarity search → top-K chunks → LLM

**Problems:** Chunks lose context. Vector search misses exact keywords. No quality
filtering on what the LLM actually receives. Works in demos, breaks in production.

### Advanced RAG (2024)
- Smarter chunking (sentence boundaries, semantic grouping)
- Hybrid search (vector + keyword/BM25)
- Reranking retrieved results before sending to LLM
- Metadata filtering (date, source, category)

**Improvement:** Much better retrieval precision. Handles both semantic and keyword
queries. Still has context loss at chunk boundaries.

### Modern RAG (2025)
- **Contextual chunking**: Each chunk is enriched with document-level context before embedding
- **Hybrid indexing**: Both vector and BM25 indexes built at ingestion time
- **Multi-stage retrieval**: Broad retrieval → reranking → context assembly
- **Query transformation**: Expand/rewrite queries for better retrieval
- **Agentic RAG**: AI agent decides when and how to search, can refine queries

**This is what we build.** The system this skill generates implements Modern RAG
techniques that are practical to deploy with n8n and PostgreSQL.

---

## Chunking: The Foundation of Everything

Chunking is how you split documents into searchable pieces. It seems simple but is the
single most impactful decision in your RAG pipeline.

### Why Chunk Size Matters

- **Too large** (>2000 tokens): Dilutes the embedding. The vector represents a mix of
  topics, making it harder to match specific queries. Also wastes LLM context window.
- **Too small** (<200 tokens): Loses context. "It increased by 3%" means nothing without
  knowing what "it" refers to.
- **Sweet spot**: 500-1000 tokens for most use cases. The exact size should be tuned
  to your content type.

### Chunking Strategies (from basic to advanced)

**1. Fixed-size chunking**
Split every N characters with M overlap.
- Pro: Simple, predictable
- Con: Cuts mid-sentence, ignores structure
- Use when: Quick prototype, uniform content

**2. Recursive character splitting**
Try to split on paragraphs → sentences → words → characters, in that order.
- Pro: Respects natural boundaries
- Con: Variable chunk sizes, still context-free
- Use when: General-purpose documents

**3. Semantic chunking**
Group sentences by embedding similarity. When similarity drops below threshold, start
new chunk.
- Pro: Chunks are topically coherent
- Con: Requires embedding each sentence (expensive at ingestion), harder to implement
- Use when: Long documents with distinct sections

**4. Document-structure-aware chunking**
Use headings, sections, list boundaries to define chunks.
- Pro: Preserves document intent
- Con: Requires parsing document structure, inconsistent across formats
- Use when: Well-structured documents (manuals, policies, FAQs)

### Recommended Default
Use **recursive character splitting** with ~800 tokens per chunk and ~200 tokens overlap,
trying to break at sentence boundaries. This balances quality, simplicity, and cost.

---

## Contextual Chunking: The Breakthrough

**This is the single most impactful improvement you can make to a RAG pipeline.**

Introduced by Anthropic in late 2024, contextual retrieval solves the fundamental problem
of chunking: when you split a document, each chunk loses the context of where it sits in
the whole document.

### The Problem
Consider this chunk from a financial report:
> "Revenue grew by 3% over the previous quarter."

Without context, this chunk could be about ANY company in ANY quarter. A vector search
for "ACME Corp Q2 2023 revenue" might not match this chunk well enough.

### The Solution: Contextual Chunking
Before embedding each chunk, prepend a short context summary generated by an LLM:

**Original chunk:**
> "Revenue grew by 3% over the previous quarter."

**Contextualized chunk:**
> "This is from ACME Corp's Q2 2023 SEC filing. The previous quarter's revenue was
> $314 million. Revenue grew by 3% over the previous quarter."

The context is generated by sending the FULL document + the specific chunk to an LLM
with this prompt:

```
<document>
{{WHOLE_DOCUMENT}}
</document>
Here is the chunk we want to situate within the whole document:
<chunk>
{{CHUNK_CONTENT}}
</chunk>
Please give a short succinct context to situate this chunk within the overall
document for the purposes of improving search retrieval of the chunk.
Answer only with the succinct context and nothing else.
```

### Impact (from Anthropic's research)
- Contextual Embeddings alone: **35% reduction** in retrieval failure rate
- Contextual Embeddings + BM25: **49% reduction**
- Contextual Embeddings + BM25 + Reranking: **67% reduction**

### Cost Considerations
Contextual chunking adds an LLM call per chunk during ingestion. For a 100-page document
with ~200 chunks, that's 200 LLM calls. Mitigations:
- Use a fast/cheap model (e.g., Claude Haiku, GPT-4o-mini) for context generation
- Use prompt caching when processing multiple chunks from the same document
- This is a one-time cost at ingestion, not per query

### When to Skip Contextual Chunking
- Documents < 500 tokens (just embed the whole thing)
- Content where every chunk is self-contained (e.g., FAQ items)
- When ingestion cost is a hard constraint

---

## Embedding Models: Choosing Wisely

The embedding model converts text into vectors. The choice affects retrieval quality,
cost, and storage.

### Recommended Models (2025)

| Model | Dimensions | Quality | Cost | Best For |
|-------|-----------|---------|------|----------|
| `text-embedding-3-small` (OpenAI) | 1536 | Very Good | Low | Default choice, great cost/quality |
| `text-embedding-3-large` (OpenAI) | 3072 | Excellent | Medium | When precision matters most |
| Voyage AI `voyage-3` | 1024 | Excellent | Medium | Best retrieval benchmarks |
| Jina `jina-embeddings-v3` | 1024 | Excellent | Medium | Best for late chunking |

### Critical Rule
**The SAME model must be used for ingestion AND querying.** Different models produce
incompatible vector spaces. Mixing them = search returns garbage.

### Dimension Considerations
Higher dimensions = more nuance but more storage and slower search. For most use cases,
1536 dimensions (text-embedding-3-small) is optimal. The storage impact:
- 1536 dims × 4 bytes = 6KB per chunk
- 100K chunks = ~600MB of vector data
- This is very manageable for PostgreSQL with HNSW indexing

---

## Retrieval Strategies

### Vector-Only Search (Naive)
Embed the query, find nearest vectors by cosine similarity.
- **Strength**: Understands semantic meaning ("happy" matches "joyful")
- **Weakness**: Misses exact keywords, IDs, acronyms, proper nouns

### BM25 / Keyword Search
Traditional text search using term frequency and inverse document frequency.
- **Strength**: Exact keyword matching, great for codes/names/IDs
- **Weakness**: No semantic understanding ("happy" won't match "joyful")

### Hybrid Search (Recommended)
Combine vector + BM25 results using score fusion. This is the recommended approach
because it covers both semantic similarity AND exact keyword matching.

**How to combine scores:**
1. **Reciprocal Rank Fusion (RRF)**: Merge ranked lists by assigning scores based on
   rank position: `score = 1 / (k + rank)`, then sum across methods
2. **Weighted score combination**: Normalize both scores to 0-1, then combine:
   `final_score = α * vector_score + (1-α) * bm25_score`
   Recommended weights: α=0.7 (vector) and 0.3 (BM25), based on Anthropic's research

**Implementation in PostgreSQL:**
Use `tsvector` + `tsquery` for BM25 alongside pgvector for embeddings. Both can be
indexed and queried in a single SQL function. See `references/sql-schema.md` for the
`hybrid_search()` function implementation.

---

## Reranking: The Precision Layer

Initial retrieval (vector/hybrid) is fast but approximate. Reranking applies a more
expensive model to re-score the top candidates.

### How It Works
1. Retrieve top-20 results via hybrid search (fast, broad)
2. Pass these 20 results through a reranker model (slower, precise)
3. Return only the top-5 reranked results to the LLM

### Reranker Options
- **Cohere Rerank** — Cloud API, very effective, easy to integrate
- **Jina Reranker v2** — Good multilingual support
- **Cross-encoder models** — Self-hosted, processes query+document pairs together

### When to Add Reranking
- When precision matters more than latency (e.g., legal, medical, compliance)
- When you have many similar documents and need to pick the MOST relevant
- When users report the AI "doesn't find the right information"

### When to Skip
- Low latency requirements (<500ms total response time)
- Small knowledge bases (<1000 chunks)
- Budget constraints (adds ~$0.001 per query with Cohere)

### Implementation in n8n
Add an HTTP Request node after hybrid search that calls the Cohere Rerank API
(or similar), then filter to top-K results before sending to the AI Agent.

---

## Query Optimization

### Query Expansion
Short user queries often under-retrieve. "How do I reset?" could mean password reset,
factory reset, cache reset, etc. Query expansion generates multiple search queries:

```
Original: "How do I reset?"
Expanded queries:
1. "How do I reset my password"
2. "How to factory reset device"  
3. "Reset account settings"
```

Implementation: Use an LLM to generate 2-3 expanded queries, run search for each,
then merge and deduplicate results before reranking.

### HyDE (Hypothetical Document Embedding)
Instead of embedding the short query directly, ask an LLM to generate a hypothetical
answer, then embed THAT answer for search. This produces embeddings more similar to
actual document chunks.

**Use when:** Queries are very short or vague.
**Skip when:** Queries are already specific, or latency is critical (adds one LLM call).

---

## The Full Pipeline

### At Ingestion Time (runs once per document)
```
1. Receive content (file/URL/text)
2. Extract text
3. Clean and normalize
4. Split into chunks (recursive, ~800 tokens, ~200 overlap)
5. [Advanced] Contextualize each chunk (LLM call)
6. Generate embedding for each chunk (embedding model)
7. Generate tsvector for BM25 (PostgreSQL built-in)
8. Store chunk + embedding + tsvector + metadata
```

The heavy lifting happens here. Contextual chunking and embedding are expensive
but run only ONCE per document. This is where you invest compute.

### At Query Time (runs every user question)
```
1. Receive question from AI agent
2. [Optional] Expand/transform query
3. Generate query embedding
4. Hybrid search: vector similarity + BM25 keyword match
5. [Optional] Rerank top results
6. Format context with source attribution
7. Return to AI agent
```

Query time must be fast (<2 seconds total). This is why we pre-compute everything
at ingestion and keep query-time processing minimal.

---

## Common Failure Modes

### 1. "The AI can't find information that's clearly in the documents"
**Cause:** Chunks are too large, embedding dilutes the specific information.
**Fix:** Reduce chunk size. Enable contextual chunking. Add BM25 hybrid search.

### 2. "Search works for some queries but not others"
**Cause:** Vector-only search misses exact terms (product codes, names, acronyms).
**Fix:** Enable hybrid search with BM25. The keyword component catches what vectors miss.

### 3. "The AI returns irrelevant information"
**Cause:** Similarity threshold too low, or no reranking.
**Fix:** Increase threshold (0.70→0.80). Add reranking step. Reduce max results.

### 4. "Processing documents takes too long"
**Cause:** Contextual chunking with large model, no batching.
**Fix:** Use faster model for contextualization (Haiku/4o-mini). Batch embedding calls.

### 5. "The AI hallucinates despite having the right context"
**Cause:** Too much context (>10 chunks) confuses the LLM, or irrelevant chunks included.
**Fix:** Return fewer, higher-quality chunks (5 max). Use reranking. Improve agent prompt.

### 6. "Documents in different languages get mixed up"
**Cause:** BM25 text search configuration doesn't match document language.
**Fix:** Set correct PostgreSQL text search configuration ('portuguese', 'english', etc).
       Vector search is naturally multilingual.

---

## Decision Framework: When to Use What

### For a Prototype / MVP
- Fixed-size chunking with overlap
- Vector-only search (no BM25)
- No contextual chunking
- No reranking
- **Result:** Works for demos, ~70% retrieval accuracy

### For Production (Recommended Default)
- Recursive chunking at sentence boundaries
- Contextual chunking enabled
- Hybrid search (vector + BM25)
- No reranking
- **Result:** Production-quality, ~85-90% retrieval accuracy

### For Mission-Critical (Legal, Medical, Compliance)
- Everything from Production, plus:
- Reranking with Cohere or cross-encoder
- Query expansion
- Lower similarity threshold + more initial results + aggressive reranking
- **Result:** Maximum accuracy, ~95%+ retrieval precision

### Small Knowledge Base Exception
If your total content is < 200,000 tokens (~500 pages), consider just stuffing
everything into the LLM context window instead of RAG. Modern models handle 128K+
tokens. This avoids all retrieval complexity. Only use RAG when the knowledge base
is too large to fit in context.
