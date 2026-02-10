# n8n Workflow Patterns & Node Configs

## Table of Contents
1. [Workflow JSON Structure](#workflow-json-structure)
2. [Node Type Versions](#node-type-versions)
3. [Binary Data Handling](#binary-data-handling)
4. [PostgreSQL Patterns](#postgresql-patterns)
5. [Error Handling](#error-handling)
6. [Credential Placeholders](#credential-placeholders)
7. [Layout Conventions](#layout-conventions)

---

## Workflow JSON Structure

```json
{
  "name": "Workflow Name",
  "nodes": [],
  "connections": {},
  "active": false,
  "settings": { "executionOrder": "v1" },
  "versionId": "uuid-v4",
  "meta": { "instanceId": "uuid-v4" },
  "tags": []
}
```

**Rules:**
- `nodes[].id` — unique UUID v4 per node
- `nodes[].name` — unique within workflow, used in `connections`
- `connections` reference nodes by `name`, not `id`
- `position` — [x, y], space ~200px horizontally between nodes

---

## Node Type Versions

Always use latest stable versions:

| Node | Type | Version |
|------|------|---------|
| Webhook | `n8n-nodes-base.webhook` | 2 |
| Code | `n8n-nodes-base.code` | 2 |
| PostgreSQL | `n8n-nodes-base.postgres` | 2.5 |
| HTTP Request | `n8n-nodes-base.httpRequest` | 4.2 |
| Respond to Webhook | `n8n-nodes-base.respondToWebhook` | 1.1 |
| Switch | `n8n-nodes-base.switch` | 3 |
| IF | `n8n-nodes-base.if` | 2 |
| Merge | `n8n-nodes-base.merge` | 3 |
| Execute Workflow Trigger | `n8n-nodes-base.executeWorkflowTrigger` | 1 |
| Error Trigger | `n8n-nodes-base.errorTrigger` | 1 |
| Extract from File | `n8n-nodes-base.extractFromFile` | 1 |
| AI Agent | `@n8n/n8n-nodes-langchain.agent` | 1.7 |
| Tool Workflow | `@n8n/n8n-nodes-langchain.toolWorkflow` | 1.1 |
| OpenAI Chat | `@n8n/n8n-nodes-langchain.lmChatOpenAi` | 1 |

---

## Binary Data Handling

Binary data (uploaded files) flows alongside JSON. Key patterns:

**Accessing binary in Code node (v2):**
```javascript
const binaryData = await this.helpers.getBinaryDataBuffer(0, 'data');
const text = binaryData.toString('utf-8');
```

**Passing binary through Code nodes:**
```javascript
return [{
  json: { ...myData },
  binary: { data: $input.first().binary.data }
}];
```

**Gotcha:** Binary does NOT pass through HTTP Request or PostgreSQL nodes automatically.
If subsequent nodes need it, forward via Code node before the break.

**Finding binary property name:**
```javascript
const binaryKey = Object.keys($input.first().binary || {})[0];
const binary = $input.first().binary[binaryKey];
```

---

## PostgreSQL Patterns

### Parameter Binding
```
query: "INSERT INTO t (a, b) VALUES ($1, $2)"
queryReplacement: "={{ [$json.a, $json.b] }}"
```

`queryReplacement` must evaluate to an **array**. Always wrap in `={{ [...] }}`.

### Type Casting

| PostgreSQL Type | Cast | Value Format |
|-----------------|------|-------------|
| text[] (array) | `$N::text[]` | `'{tag1,tag2}'` (curly braces) |
| vector | `$N::vector` | `'[0.1, 0.2, 0.3]'` (square brackets) |
| jsonb | `$N::jsonb` | `'{"key":"value"}'` (JSON string) |
| regconfig | `$N::regconfig` | `'portuguese'` (language name) |

### NULL handling
```javascript
queryReplacement: `={{ [$json.value, $json.optional || null] }}`
```

### Accessing results from previous nodes
```javascript
// In queryReplacement expression:
$('Node Name').first().json.id       // Single value
$('Node Name').all().map(i => i.json.id)  // Array
```

---

## Error Handling

### Pattern 1: Error Trigger (workflow-level)
Catches any unhandled error. Add to every workflow.

```json
{
  "parameters": {},
  "name": "On Error",
  "type": "n8n-nodes-base.errorTrigger",
  "typeVersion": 1
}
```

### Pattern 2: continueOnFail (node-level)
For nodes that might fail (external APIs, file parsing):

```json
{
  "parameters": { ... },
  "continueOnFail": true
}
```

After failure, `$json` contains `{ error: { message, description } }`.

### Pattern 3: try/catch in Code nodes
```javascript
try {
  // risky operation
} catch (error) {
  return [{ json: { success: false, error: error.message } }];
}
```

**Recommendation:** Use all three together.

---

## Credential Placeholders

Generated workflows should use placeholder credential IDs:

```json
"credentials": {
  "postgres": {
    "id": "POSTGRES_CREDENTIAL_ID",
    "name": "Supabase PostgreSQL"
  }
}
```

```json
"credentials": {
  "openAiApi": {
    "id": "OPENAI_CREDENTIAL_ID",
    "name": "OpenAI API"
  }
}
```

Add a note in the workflow description: "After importing, update credential IDs
in all PostgreSQL and OpenAI nodes."

### PostgreSQL credential for Supabase:
```
Host: db.<project-ref>.supabase.co
Port: 5432 (direct) or 6543 (pooling)
Database: postgres
User: postgres
Password: <database-password>
SSL: Enable (required for Supabase Cloud)
```

---

## Layout Conventions

Position nodes for readability:

```
Main flow (left to right):   [200, 300] → [420, 300] → [640, 300]
Error branch (below):        [420, 520] → [640, 520]
Switch outputs (fan out):    [640, 100], [640, 300], [640, 500]
Merge (converge):            [860, 300]
```

Spacing: ~220px horizontal, ~200px vertical between branches.
