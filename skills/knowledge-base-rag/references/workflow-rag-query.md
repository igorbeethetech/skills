# RAG Query Workflow Reference

## Table of Contents
1. [Architecture](#architecture)
2. [Integration with n8n AI Agent](#integration-with-n8n-ai-agent)
3. [Query Pipeline](#query-pipeline)
4. [Hybrid Search Implementation](#hybrid-search-implementation)
5. [Context Formatting](#context-formatting)
6. [Optional: Reranking Step](#optional-reranking-step)
7. [Optional: Query Expansion](#optional-query-expansion)

---

## Architecture

This workflow is a **Tool** that the n8n AI Agent calls when it needs to search
the knowledge base. The agent decides WHEN to search based on the tool description.

```
n8n AI Agent
  ├── Tool: "Search Knowledge Base" → THIS WORKFLOW
  ├── Tool: Other tools (optional)
  └── Memory: Chat memory (optional)
```

The tool receives a query string and returns formatted context with source attribution.

---

## Integration with n8n AI Agent

### As a Tool Workflow (recommended)

In the main AI Agent workflow, add a **Tool Workflow** node:

```json
{
  "parameters": {
    "name": "search_knowledge_base",
    "description": "Search the knowledge base for information from uploaded documents, websites, and text content. Use this tool whenever the user asks a question that might be answered by the knowledge base. The input should be the search query in natural language. Returns relevant text passages with source attribution.",
    "workflowId": "={{ $workflow.id }}",
    "fields": {
      "values": [
        {
          "name": "query",
          "description": "The search query in natural language",
          "type": "string",
          "required": true
        },
        {
          "name": "category",
          "description": "Optional: filter by category (e.g., 'policies', 'products')",
          "type": "string",
          "required": false
        },
        {
          "name": "source_type",
          "description": "Optional: filter by source type ('file', 'url', 'text')",
          "type": "string",
          "required": false
        }
      ]
    }
  },
  "name": "Knowledge Base Search",
  "type": "@n8n/n8n-nodes-langchain.toolWorkflow",
  "typeVersion": 1.1
}
```

**Tool description matters:** The AI Agent uses the tool description to decide when
to call it. A vague description = tool doesn't get called enough. A specific description
= better agent behavior.

---

## Query Pipeline

```
Execute Workflow Trigger (receives query from Agent)
  → Prepare Query Parameters (Code)
  → Generate Query Embedding (OpenAI)
  → Hybrid Search (PostgreSQL: hybrid_search function)
  → Format Context (Code)
  → Return to Agent
```

### Node 1: Execute Workflow Trigger

```json
{
  "parameters": {},
  "name": "Tool Input",
  "type": "n8n-nodes-base.executeWorkflowTrigger",
  "typeVersion": 1
}
```

### Node 2: Prepare Query (Code)

```javascript
const input = $input.first().json;
const query = input.query;
const category = input.category || null;
const sourceType = input.source_type || null;

if (!query || query.trim().length < 2) {
  return [{
    json: {
      response: 'Please provide a more specific search query.',
      sources: []
    }
  }];
}

return [{
  json: {
    query: query.trim(),
    category,
    sourceType,
    maxResults: 10  // Retrieve 10, will filter/format to top 5
  }
}];
```

### Node 3: Generate Query Embedding (HTTP Request)

```json
{
  "parameters": {
    "method": "POST",
    "url": "https://api.openai.com/v1/embeddings",
    "authentication": "predefinedCredentialType",
    "nodeCredentialType": "openAiApi",
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={{ JSON.stringify({ input: $json.query, model: 'text-embedding-3-small' }) }}"
  },
  "name": "Generate Query Embedding",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2
}
```

**Critical:** Use the SAME embedding model as ingestion. Mismatched models = broken search.

---

## Hybrid Search Implementation

### Node 4: Hybrid Search (PostgreSQL)

```json
{
  "parameters": {
    "operation": "executeQuery",
    "query": "SELECT * FROM hybrid_search($1::vector, $2, $3::int, 0.7, 0.3, $4, $5, 'portuguese');",
    "options": {
      "queryReplacement": "={{ ['[' + $('Generate Query Embedding').first().json.data[0].embedding.join(',') + ']', $('Prepare Query').first().json.query, $('Prepare Query').first().json.maxResults, $('Prepare Query').first().json.category, $('Prepare Query').first().json.sourceType] }}"
    }
  },
  "name": "Hybrid Search",
  "type": "n8n-nodes-base.postgres",
  "typeVersion": 2.5
}
```

**Notes on the query:**
- `$1::vector` — query embedding formatted as `[0.1, 0.2, ...]`
- `$2` — original query text (used for BM25 keyword matching)
- `$3` — max results
- `0.7, 0.3` — vector:BM25 weight ratio
- `$4, $5` — category and source_type filters (NULL if not provided)
- `'portuguese'` — change to match your content language

### For multi-tenant systems:
Use `hybrid_search_tenant` instead and pass `tenant_id` as additional parameter.

---

## Context Formatting

### Node 5: Format Context (Code)

```javascript
const results = $input.all().map(item => item.json);
const query = $('Prepare Query').first().json.query;

if (!results || results.length === 0 || !results[0].chunk_id) {
  return [{
    json: {
      response: 'No relevant information was found in the knowledge base for this query. The user may need to add more content or rephrase their question.',
      sources: [],
      resultCount: 0
    }
  }];
}

// Take top 5 results (already sorted by combined_score)
const topResults = results.slice(0, 5);

// Build context with source attribution
const contextParts = topResults.map((r, i) => {
  const score = (r.combined_score * 100).toFixed(0);
  const typeEmoji = r.source_type === 'file' ? '📄' 
    : r.source_type === 'url' ? '🔗' : '📝';
  return `[Source ${i + 1}: ${typeEmoji} ${r.source_title} (relevance: ${score}%)]\n${r.content}`;
});

const sources = topResults.map(r => ({
  title: r.source_title,
  type: r.source_type,
  sourceId: r.source_id,
  chunkIndex: r.chunk_index,
  combinedScore: r.combined_score,
  vectorSimilarity: r.vector_similarity,
  textRank: r.text_rank
}));

const avgScore = topResults.reduce((sum, r) => sum + r.combined_score, 0) / topResults.length;

return [{
  json: {
    response: `Found ${topResults.length} relevant passages from the knowledge base:\n\n${contextParts.join('\n\n---\n\n')}`,
    sources,
    resultCount: topResults.length,
    avgScore,
    query
  }
}];
```

The AI Agent receives this response and uses it to formulate its answer to the user.
The `response` field is the primary text the agent will reference.

---

## Optional: Reranking Step

Add between Hybrid Search and Format Context when maximum precision is needed.

### Using Cohere Rerank API

```json
{
  "parameters": {
    "method": "POST",
    "url": "https://api.cohere.com/v1/rerank",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        { "name": "Authorization", "value": "Bearer {{$credentials.cohereApi.apiKey}}" },
        { "name": "Content-Type", "value": "application/json" }
      ]
    },
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={{ JSON.stringify({ query: $('Prepare Query').first().json.query, documents: $input.all().map(i => i.json.content), model: 'rerank-v3.5', top_n: 5 }) }}"
  },
  "name": "Rerank Results",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2
}
```

Then merge reranked order back with original results:

```javascript
const reranked = $json.results; // [{index, relevance_score}, ...]
const origResults = $('Hybrid Search').all().map(i => i.json);

const rerankedResults = reranked.map(r => ({
  ...origResults[r.index],
  rerank_score: r.relevance_score
}));

return rerankedResults.map(r => ({ json: r }));
```

---

## Optional: Query Expansion

Add before Generate Query Embedding when queries tend to be short or vague.

```javascript
// Use OpenAI to generate expanded queries
const query = $json.query;

// Only expand if query is short
if (query.split(' ').length > 8) {
  return [{ json: { queries: [query] } }];
}

// The LLM call to expand is done via the next OpenAI/HTTP node
return [{
  json: {
    expandPrompt: `Given this user question: "${query}"
    
Generate 3 alternative search queries that would help find relevant information.
Each query should approach the topic from a slightly different angle.
Return ONLY the queries, one per line, no numbering or bullets.`,
    originalQuery: query
  }
}];
```

Then after the LLM responds, run hybrid search for EACH expanded query, merge results,
deduplicate by chunk_id, and sort by best score. This significantly improves recall
for vague queries.

---

## Complete Node Flow

### Basic (recommended for most cases):
```
Tool Input → Prepare Query → Generate Embedding → Hybrid Search → Format Context → [return]
```

### With Reranking:
```
Tool Input → Prepare Query → Generate Embedding → Hybrid Search → Rerank → Format Context → [return]
```

### With Query Expansion + Reranking:
```
Tool Input → Prepare Query → Expand Query (LLM) → [for each expanded query]
  → Generate Embedding → Hybrid Search → [merge all results] → Deduplicate → Rerank
  → Format Context → [return]
```

Start with Basic, then add layers based on observed retrieval quality.
