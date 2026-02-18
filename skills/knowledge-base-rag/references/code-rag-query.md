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
8. [Structured Output](#structured-output)
9. [Citation-Based Prompt Template](#citation-based-prompt-template)
10. [Cross-Encoder Reranking](#cross-encoder-reranking)
11. [LangChain / LangGraph Integration](#langchain--langgraph-integration)
12. [Evaluation Helpers](#evaluation-helpers)

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

---

## Structured Output

For applications that need structured responses from RAG (API responses, UI rendering):

### TypeScript (Zod schema)

```typescript
import { z } from 'zod';

const RAGStructuredResponse = z.object({
  answer: z.string().describe('The answer based on retrieved context'),
  confidence: z.number().min(0).max(1).describe('Confidence score'),
  sources_used: z.array(z.number()).describe('Indices of sources used'),
  follow_up_questions: z.array(z.string()).describe('Suggested follow-up questions'),
  no_answer: z.boolean().describe('True if context does not contain enough information')
});

type RAGStructuredResponse = z.infer<typeof RAGStructuredResponse>;

export async function structuredRagQuery(query: string): Promise<RAGStructuredResponse> {
  const ragResult = await ragQuery(query);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `Answer the question based on the context. Return JSON matching this schema:
{
  "answer": "your answer",
  "confidence": 0.0-1.0,
  "sources_used": [1, 3],
  "follow_up_questions": ["question 1"],
  "no_answer": false
}

Context:
${ragResult.context}`
      },
      { role: 'user', content: query }
    ],
    response_format: { type: 'json_object' }
  });

  return RAGStructuredResponse.parse(
    JSON.parse(response.choices[0].message.content!)
  );
}
```

### Python (Pydantic)

```python
from pydantic import BaseModel, Field

class RAGStructuredResponse(BaseModel):
    answer: str = Field(description="The answer based on retrieved context")
    confidence: float = Field(ge=0, le=1, description="Confidence score")
    sources_used: list[int] = Field(description="Indices of sources used")
    follow_up_questions: list[str] = Field(description="Suggested follow-up questions")
    no_answer: bool = Field(description="True if context lacks enough info")

async def structured_rag_query(query: str) -> RAGStructuredResponse:
    rag_result = await rag_query(query)

    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": f"""Answer the question based on the context. Return JSON:
{{"answer": "...", "confidence": 0.0-1.0, "sources_used": [1, 3], "follow_up_questions": ["..."], "no_answer": false}}

Context:
{rag_result.context}"""},
            {"role": "user", "content": query}
        ],
        response_format={"type": "json_object"}
    )

    return RAGStructuredResponse.model_validate_json(response.choices[0].message.content)
```

---

## Citation-Based Prompt Template

A prompt template that enforces source citations in responses:

```typescript
const CITATION_PROMPT = `You are a helpful assistant with access to a knowledge base.
Answer the user's question using ONLY the provided context.

Rules:
- Cite your sources using [Source N] notation after each claim
- If the context doesn't contain enough information, say: "I don't have enough information to answer this fully."
- Never make up information not present in the sources
- If multiple sources confirm the same fact, cite all of them
- End your response with a "Sources Used" section listing the full source titles

## Knowledge Base Context:
{context}

## Sources:
{sources}`;

export function buildCitationPrompt(ragResult: RAGResponse): string {
  const sourcesStr = ragResult.sources
    .map((s, i) => `[Source ${i + 1}]: ${s.title} (${s.type})`)
    .join('\n');

  return CITATION_PROMPT
    .replace('{context}', ragResult.context)
    .replace('{sources}', sourcesStr);
}
```

```python
CITATION_PROMPT = """You are a helpful assistant with access to a knowledge base.
Answer the user's question using ONLY the provided context.

Rules:
- Cite your sources using [Source N] notation after each claim
- If the context doesn't contain enough information, say: "I don't have enough information to answer this fully."
- Never make up information not present in the sources
- If multiple sources confirm the same fact, cite all of them
- End your response with a "Sources Used" section listing the full source titles

## Knowledge Base Context:
{context}

## Sources:
{sources}"""

def build_citation_prompt(rag_result: RAGResponse) -> str:
    sources_str = "\n".join(
        f"[Source {i+1}]: {s['title']} ({s['type']})"
        for i, s in enumerate(rag_result.sources)
    )
    return CITATION_PROMPT.format(context=rag_result.context, sources=sources_str)
```

---

## Cross-Encoder Reranking

Alternative to Cohere Rerank using open-source cross-encoder models from sentence-transformers.
Runs locally — no API costs, but requires GPU for best performance.

### Python (sentence-transformers)

```python
from sentence_transformers import CrossEncoder

# Load model (downloads on first use, ~420MB)
reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-12-v2")

def cross_encoder_rerank(
    query: str,
    documents: list[str],
    top_n: int = 5
) -> list[dict]:
    # Create query-document pairs
    pairs = [[query, doc] for doc in documents]

    # Score all pairs
    scores = reranker.predict(pairs)

    # Sort by score, return top N
    scored = sorted(
        enumerate(scores),
        key=lambda x: x[1],
        reverse=True
    )[:top_n]

    return [{"index": idx, "relevance_score": float(score)} for idx, score in scored]

# Usage in the query pipeline:
# results = await hybrid_search(embedding, query, max_results=20)
# reranked = cross_encoder_rerank(query, [r["content"] for r in results], top_n=5)
# final_results = [results[r["index"]] for r in reranked]
```

### TypeScript (via Python subprocess or API)

For TypeScript projects, you have two options:
1. **Run a Python microservice** with the cross-encoder model and call it via HTTP
2. **Use Cohere Rerank API** (cloud-based, no local GPU needed) — see existing reranking section above

```typescript
// Option 1: Call local Python reranking service
async function crossEncoderRerank(
  query: string,
  documents: string[],
  topN: number = 5
): Promise<Array<{ index: number; relevanceScore: number }>> {
  const response = await fetch('http://localhost:8001/rerank', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, documents, top_n: topN })
  });
  return response.json();
}
```

---

## LangChain / LangGraph Integration

Complete RAG chain using LangGraph for more control over the retrieval and generation pipeline.

### Python (LangGraph RAG Chain)

```python
from langgraph.graph import StateGraph, START, END
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from langchain_core.messages import HumanMessage, SystemMessage
from typing import TypedDict

class RAGState(TypedDict):
    question: str
    context: str
    sources: list[dict]
    answer: str

# Define nodes
async def retrieve(state: RAGState) -> RAGState:
    """Retrieve relevant documents from knowledge base."""
    result = await rag_query(state["question"])
    return {
        **state,
        "context": result.context,
        "sources": result.sources
    }

async def generate(state: RAGState) -> RAGState:
    """Generate answer using retrieved context."""
    llm = ChatOpenAI(model="gpt-4o")
    response = await llm.ainvoke([
        SystemMessage(content=f"""Answer based on this context. Cite sources using [Source N].

Context:
{state['context']}"""),
        HumanMessage(content=state["question"])
    ])
    return {**state, "answer": response.content}

# Build graph
graph = StateGraph(RAGState)
graph.add_node("retrieve", retrieve)
graph.add_node("generate", generate)
graph.add_edge(START, "retrieve")
graph.add_edge("retrieve", "generate")
graph.add_edge("generate", END)

rag_chain = graph.compile()

# Usage
result = await rag_chain.ainvoke({"question": "What is the refund policy?"})
print(result["answer"])
```

### TypeScript (LangChain)

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence, RunnablePassthrough } from '@langchain/core/runnables';

const llm = new ChatOpenAI({ modelName: 'gpt-4o' });

const prompt = ChatPromptTemplate.fromTemplate(`
Answer the question based on the following context. Cite sources using [Source N].

Context:
{context}

Question: {question}
`);

const ragChain = RunnableSequence.from([
  {
    context: async (input: { question: string }) => {
      const result = await ragQuery(input.question);
      return result.context;
    },
    question: (input: { question: string }) => input.question
  },
  prompt,
  llm,
  new StringOutputParser()
]);

// Usage
const answer = await ragChain.invoke({ question: 'What is the refund policy?' });
```

---

## Evaluation Helpers

Functions to measure RAG quality during development and testing.

### Python

```python
from dataclasses import dataclass

@dataclass
class EvalCase:
    question: str
    expected_keywords: list[str]  # Keywords that should appear in retrieved context
    expected_answer_keywords: list[str] = None  # Keywords in the final answer

async def evaluate_retrieval(cases: list[EvalCase], rag_fn) -> dict:
    """Evaluate retrieval quality: are the right chunks being found?"""
    results = {"hit_rate": 0, "avg_precision": 0, "details": []}

    for case in cases:
        response = await rag_fn(case.question)
        context = response.context.lower()

        found = [kw for kw in case.expected_keywords if kw.lower() in context]
        precision = len(found) / len(case.expected_keywords) if case.expected_keywords else 0

        results["details"].append({
            "question": case.question,
            "precision": precision,
            "found": found,
            "missing": [kw for kw in case.expected_keywords if kw.lower() not in context]
        })

    results["avg_precision"] = sum(d["precision"] for d in results["details"]) / len(cases)
    results["hit_rate"] = sum(1 for d in results["details"] if d["precision"] > 0.5) / len(cases)
    return results

# Usage:
# cases = [
#     EvalCase("What is the refund policy?", ["refund", "7 days", "return"]),
#     EvalCase("How to contact support?", ["support", "email", "contact"]),
# ]
# results = await evaluate_retrieval(cases, rag_query)
# print(f"Hit rate: {results['hit_rate']:.0%}")
# print(f"Avg precision: {results['avg_precision']:.0%}")
# for d in results['details']:
#     if d['missing']:
#         print(f"  MISS: {d['question']} — missing: {d['missing']}")
```

### TypeScript

```typescript
interface EvalCase {
  question: string;
  expectedKeywords: string[];
}

async function evaluateRetrieval(
  cases: EvalCase[],
  ragFn: (query: string) => Promise<RAGResponse>
): Promise<{ hitRate: number; avgPrecision: number; details: any[] }> {
  const details = [];

  for (const testCase of cases) {
    const response = await ragFn(testCase.question);
    const context = response.context.toLowerCase();

    const found = testCase.expectedKeywords.filter(kw => context.includes(kw.toLowerCase()));
    const precision = found.length / testCase.expectedKeywords.length;

    details.push({
      question: testCase.question,
      precision,
      found,
      missing: testCase.expectedKeywords.filter(kw => !context.includes(kw.toLowerCase()))
    });
  }

  return {
    hitRate: details.filter(d => d.precision > 0.5).length / cases.length,
    avgPrecision: details.reduce((sum, d) => sum + d.precision, 0) / cases.length,
    details
  };
}
```
