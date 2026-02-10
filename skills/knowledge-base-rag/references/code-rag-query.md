# Code Mode: RAG Query Service Reference

Implementation patterns for the RAG query layer in application code.

## Table of Contents
1. [Query Service](#query-service)
2. [Hybrid Search](#hybrid-search)
3. [Context Formatting](#context-formatting)
4. [Optional: Reranking](#optional-reranking)
5. [Optional: Query Expansion](#optional-query-expansion)
6. [API Endpoints](#api-endpoints)
7. [Integration with LLM/Agent](#integration-with-llm-agent)

---

## Query Service

### TypeScript

```typescript
// rag-query.service.ts
import { pool } from '../lib/db';
import { generateEmbedding } from '../lib/embeddings';

export interface SearchResult {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  sourceType: 'file' | 'url' | 'text';
  content: string;
  context: string | null;
  chunkIndex: number;
  metadata: Record<string, unknown>;
  vectorSimilarity: number;
  textRank: number;
  combinedScore: number;
}

export interface RAGResponse {
  context: string;
  sources: Array<{
    title: string;
    type: string;
    sourceId: string;
    score: number;
  }>;
  resultCount: number;
  query: string;
}

export async function ragQuery(
  query: string,
  options?: {
    category?: string;
    sourceType?: string;
    maxResults?: number;
    language?: string;
  }
): Promise<RAGResponse> {
  const maxResults = options?.maxResults || 10;
  const language = options?.language || 'portuguese';

  // 1. Generate query embedding
  const embedding = await generateEmbedding(query);

  // 2. Hybrid search
  const results = await hybridSearch(embedding, query, {
    maxResults,
    category: options?.category,
    sourceType: options?.sourceType,
    language
  });

  // 3. Format context (take top 5)
  return formatContext(results.slice(0, 5), query);
}
```

### Python

```python
# services/rag_query.py
from dataclasses import dataclass
from core.embeddings import generate_embedding
from core.database import pool

@dataclass
class RAGResponse:
    context: str
    sources: list[dict]
    result_count: int
    query: str

async def rag_query(
    query: str,
    category: str = None,
    source_type: str = None,
    max_results: int = 10,
    language: str = "portuguese"
) -> RAGResponse:
    # 1. Generate query embedding
    embedding = await generate_embedding(query)

    # 2. Hybrid search
    results = await hybrid_search(
        embedding, query,
        max_results=max_results,
        category=category,
        source_type=source_type,
        language=language
    )

    # 3. Format context (top 5)
    return format_context(results[:5], query)
```

---

## Hybrid Search

### TypeScript

```typescript
async function hybridSearch(
  queryEmbedding: number[],
  queryText: string,
  options: {
    maxResults: number;
    category?: string;
    sourceType?: string;
    language: string;
  }
): Promise<SearchResult[]> {
  const embeddingStr = `[${queryEmbedding.join(',')}]`;

  const result = await pool.query(
    `SELECT * FROM hybrid_search($1::vector, $2, $3::int, 0.7, 0.3, $4, $5, $6)`,
    [
      embeddingStr,
      queryText,
      options.maxResults,
      options.category || null,
      options.sourceType || null,
      options.language
    ]
  );

  return result.rows.map(row => ({
    chunkId: row.chunk_id,
    sourceId: row.source_id,
    sourceTitle: row.source_title,
    sourceType: row.source_type,
    content: row.content,
    context: row.context,
    chunkIndex: row.chunk_index,
    metadata: row.metadata,
    vectorSimilarity: row.vector_similarity,
    textRank: row.text_rank,
    combinedScore: row.combined_score
  }));
}
```

### Python

```python
async def hybrid_search(
    query_embedding: list[float],
    query_text: str,
    max_results: int = 10,
    category: str = None,
    source_type: str = None,
    language: str = "portuguese"
) -> list[dict]:
    embedding_str = f"[{','.join(str(x) for x in query_embedding)}]"

    rows = await pool.fetch(
        "SELECT * FROM hybrid_search($1::vector, $2, $3::int, 0.7, 0.3, $4, $5, $6)",
        embedding_str, query_text, max_results,
        category, source_type, language
    )

    return [dict(row) for row in rows]
```

---

## Context Formatting

### TypeScript

```typescript
function formatContext(
  results: SearchResult[],
  query: string
): RAGResponse {
  if (!results.length) {
    return {
      context: 'No relevant information found in the knowledge base.',
      sources: [],
      resultCount: 0,
      query
    };
  }

  const typeEmoji: Record<string, string> = {
    file: '📄', url: '🔗', text: '📝'
  };

  const contextParts = results.map((r, i) => {
    const score = (r.combinedScore * 100).toFixed(0);
    const emoji = typeEmoji[r.sourceType] || '📎';
    return `[Source ${i + 1}: ${emoji} ${r.sourceTitle} (${score}% relevant)]\n${r.content}`;
  });

  return {
    context: contextParts.join('\n\n---\n\n'),
    sources: results.map(r => ({
      title: r.sourceTitle,
      type: r.sourceType,
      sourceId: r.sourceId,
      score: r.combinedScore
    })),
    resultCount: results.length,
    query
  };
}
```

### Python

```python
def format_context(results: list[dict], query: str) -> RAGResponse:
    if not results:
        return RAGResponse(
            context="No relevant information found in the knowledge base.",
            sources=[], result_count=0, query=query
        )

    emojis = {"file": "📄", "url": "🔗", "text": "📝"}
    parts = []
    sources = []

    for i, r in enumerate(results):
        score = f"{r['combined_score'] * 100:.0f}"
        emoji = emojis.get(r["source_type"], "📎")
        parts.append(f"[Source {i+1}: {emoji} {r['source_title']} ({score}% relevant)]\n{r['content']}")
        sources.append({
            "title": r["source_title"],
            "type": r["source_type"],
            "source_id": str(r["source_id"]),
            "score": r["combined_score"]
        })

    return RAGResponse(
        context="\n\n---\n\n".join(parts),
        sources=sources,
        result_count=len(results),
        query=query
    )
```

---

## Optional: Reranking

Add when maximum retrieval precision is needed.

### TypeScript (with Cohere)

```typescript
// reranker.ts
import axios from 'axios';

export async function rerank(
  query: string,
  documents: string[],
  topN: number = 5
): Promise<Array<{ index: number; relevanceScore: number }>> {
  const response = await axios.post(
    'https://api.cohere.com/v1/rerank',
    {
      query,
      documents,
      model: 'rerank-v3.5',
      top_n: topN
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.COHERE_API_KEY}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data.results.map((r: any) => ({
    index: r.index,
    relevanceScore: r.relevance_score
  }));
}

// Usage in the query pipeline:
// After hybrid search, before format context:
//
// const reranked = await rerank(query, results.map(r => r.content), 5);
// const rerankedResults = reranked.map(r => ({
//   ...results[r.index],
//   combinedScore: r.relevanceScore  // Override score with reranker
// }));
```

### Python (with Cohere)

```python
# reranker.py
import httpx, os

async def rerank(query: str, documents: list[str], top_n: int = 5) -> list[dict]:
    async with httpx.AsyncClient() as client:
        response = await client.post(
            "https://api.cohere.com/v1/rerank",
            json={"query": query, "documents": documents, "model": "rerank-v3.5", "top_n": top_n},
            headers={"Authorization": f"Bearer {os.environ['COHERE_API_KEY']}"}
        )
        return [{"index": r["index"], "relevance_score": r["relevance_score"]}
                for r in response.json()["results"]]
```

---

## Optional: Query Expansion

For short/vague queries, expand into multiple search angles.

### TypeScript

```typescript
export async function expandQuery(query: string): Promise<string[]> {
  // Only expand short queries
  if (query.split(' ').length > 8) return [query];

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'user',
      content: `Given this search query: "${query}"
Generate 2 alternative search queries that approach the topic from different angles.
Return ONLY the queries, one per line, no numbering.`
    }],
    max_tokens: 100,
    temperature: 0.7
  });

  const expanded = response.choices[0].message.content?.trim().split('\n')
    .filter(q => q.trim().length > 0) || [];

  return [query, ...expanded];
}

// Usage: run hybridSearch for each expanded query, merge results,
// deduplicate by chunkId, sort by best score
```

---

## API Endpoints

### TypeScript (Express)

```typescript
// In knowledge.routes.ts, add:
router.post('/search', async (req, res) => {
  try {
    const { query, category, source_type, max_results } = req.body;
    if (!query) return res.status(400).json({ error: 'Query is required' });

    const result = await ragQuery(query, {
      category, sourceType: source_type, maxResults: max_results
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### Python (FastAPI)

```python
# In routes/knowledge.py, add:
@router.post("/search")
async def search(data: dict):
    if not data.get("query"):
        raise HTTPException(400, "Query is required")
    return await rag_query(
        query=data["query"],
        category=data.get("category"),
        source_type=data.get("source_type"),
        max_results=data.get("max_results", 10)
    )
```

---

## Integration with LLM/Agent

### Using as context for a chat endpoint

```typescript
// chat.routes.ts
router.post('/chat', async (req, res) => {
  const { message, conversationHistory = [] } = req.body;

  // 1. Search knowledge base
  const ragResult = await ragQuery(message);

  // 2. Build system prompt with RAG context
  const systemPrompt = `You are a helpful assistant with access to a knowledge base.
Use the following context to answer the user's question. If the context doesn't
contain relevant information, say so honestly.

## Knowledge Base Context:
${ragResult.context}

## Sources:
${ragResult.sources.map(s => `- ${s.title} (${s.type})`).join('\n')}

Always cite which source you're using when answering.`;

  // 3. Call LLM
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: message }
    ]
  });

  res.json({
    answer: response.choices[0].message.content,
    sources: ragResult.sources
  });
});
```

### Using with LangChain / Vercel AI SDK

The `ragQuery` function can be wrapped as a tool for any agent framework:

```typescript
// For Vercel AI SDK
import { tool } from 'ai';
import { z } from 'zod';

const searchKnowledgeBase = tool({
  description: 'Search the knowledge base for information from uploaded documents, URLs, and text.',
  parameters: z.object({
    query: z.string().describe('The search query'),
    category: z.string().optional()
  }),
  execute: async ({ query, category }) => {
    const result = await ragQuery(query, { category });
    return result.context;
  }
});
```
