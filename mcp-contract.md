# MCP Server Contract: Laravel Memory

## 1. Server Manifest

| Field           | Value                                                                                                                        |
| :-------------- | :--------------------------------------------------------------------------------------------------------------------------- |
| **Name**        | `Memory MCP Server`                                                                                                          |
| **Version**     | `1.0.0`                                                                                                                      |
| **Description** | Manages structured memories (facts, preferences, rules) for the application. Supports hierarchical searching and versioning. |

---

## 2. Tools Contract

### 2.1 `memory-write`
**Purpose**: Create a new memory entry. Supports facts, preferences, and business rules.

#### Request Schema
```json
{
  "name": "memory-write",
  "arguments": {
    "organization": "string (required)",
    "scope_type": "string (enum, required)",
    "memory_type": "string (enum, required)",
    "current_content": "string (required)",
    "id": "string (UUID, optional)",
    "repository": "string (optional)",
    "title": "string (optional)",
    "status": "string (enum, optional, default: draft)",
    "importance": "integer (1-10, optional, default: 1)",
    "metadata": "object (optional)"
  }
}
```

#### JSON-RPC Example
**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "memory-write",
    "arguments": {
      "organization": "acme-corp",
      "scope_type": "organization",
      "memory_type": "business_rule",
      "current_content": "All deployments must pass acceptance tests.",
      "title": "Deployment Policy",
      "importance": 10
    }
  },
  "id": 1
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"id\":\"550e8400-e29b-41d4-a716-446655440000\",\"organization\":\"acme-corp\",\"scope_type\":\"organization\",\"memory_type\":\"business_rule\",\"current_content\":\"All deployments must pass acceptance tests.\",\"title\":\"Deployment Policy\",\"status\":\"draft\",\"importance\":10,\"created_at\":\"...\"}"
      }
    ]
  },
  "id": 1
}
```

#### Response Schema
The tool returns the created memory object as a JSON string.
```json
{
  "id": "uuid",
  "organization": "string",
  "repository": "string|null",
  "scope_type": "string",
  "memory_type": "string",
  "title": "string",
  "current_content": "string",
  "status": "string",
  "importance": "integer",
  "metadata": "object|array",
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

#### Idempotency & Rules
- **Create**: If `id` is omitted, the server generates a new UUID. **NOT Idempotent**.
- **Upsert**: If `id` is provided, it acts as an update (if exists) or create (if not). **Idempotent** (updates same resource).

---

### 2.2 `memory-update`
**Purpose**: Update an existing memory entry by its UUID.

#### Request Schema
```json
{
  "name": "memory-update",
  "arguments": {
    "id": "string (UUID, required)",
    "title": "string (optional)",
    "current_content": "string (optional)",
    "status": "string (enum, optional)",
    "scope_type": "string (enum, optional)",
    "memory_type": "string (enum, optional)",
    "importance": "integer (optional)",
    "metadata": "object (optional)"
  }
}
```

#### JSON-RPC Example
**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "memory-update",
    "arguments": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "status": "active"
    }
  },
  "id": 2
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"id\":\"550e8400-...\",\"status\":\"active\", ...}"
      }
    ]
  },
  "id": 2
}
```

#### Idempotency & Rules
- **Idempotent**: Yes. Calling multiple times with same data results in same state.
- **Partial Update**: Only provided fields are updated.

---

### 2.3 `memory-delete`
**Purpose**: Soft-delete a memory entry.

#### Request Schema
```json
{
  "name": "memory-delete",
  "arguments": {
    "id": "string (UUID, required)"
  }
}
```

#### Response Schema
Returns a plain text confirmation message.
```text
Memory 550e8400-e29b-41d4-a716-446655440000 has been soft-deleted.
```

#### Idempotency & Rules
- **Idempotent**: Side-effect is idempotent (resource is deleted).
- **Behavior**: If called on already deleted/non-existent ID, returns 404 Error (at JSON-RPC level).

---

### 2.4 `memory-search`
**Purpose**: Search/Filtering.

#### Request Schema
```json
{
  "name": "memory-search",
  "arguments": {
    "query": "string (optional)",
    "filters": {
      "repository": "string (optional)",
      "memory_type": "string (enum, optional)",
      "status": "string (enum, optional)",
      "scope_type": "string (enum, optional)",
      "metadata": "object (optional)"
    }
  }
}
```

#### JSON-RPC Example
**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "memory-search",
    "arguments": {
      "query": "deploy",
      "filters": {
        "memory_type": "business_rule"
      }
    }
  },
  "id": 3
}
```

#### Response Schema
Returns a JSON array of complete memory objects.
```json
[
  {
    "id": "...",
    "title": "...",
    "current_content": "...",
    "relevance": 4.5
  }
]
```

#### Search Behavior (Pagination & Limits)
- **Pagination**: **NOT SUPPORTED**.
- **Limit**: **UNBOUNDED**. The server returns ALL matching records.
- **Sorting**: Matches are sorted by Relevance (if query provided) -> Importance (Desc) -> Created At (Desc).

---

### 2.5 `memory-link`
**Purpose**: Create relationships.

#### Request Schema
```json
{
  "name": "memory-link",
  "arguments": {
    "source_id": "uuid (required)",
    "target_id": "uuid (required)",
    "relation_type": "string (default: 'related')"
  }
}
```

#### Response Schema
Returns text confirmation.
```text
Memories linked successfully as 'related'.
```

#### Idempotency
- **Idempotent**: Yes (`syncWithoutDetaching`). Linking A to B multiple times has no extra effect.

---

## 3. Resources Contract

### 3.1 `memory://index`
**Description**: Discovery endpoint.
**Payload**: JSON Array of **lightweight** objects.
**Excluded Fields**: `current_content` is ALWAYS excluded.

```json
[
  {
    "id": "uuid",
    "title": "Short title",
    "scope_type": "system",
    "memory_type": "fact",
    "importance": 1,
    "status": "draft",
    "repository": "slug",
    "organization": "slug",
    "updated_at": "ISO8601",
    "metadata": {}
  }
]
```
**Limit**: Hardcoded to 50 most recent items.

---

## 4. Prompts Contract (Full Text)

### 4.1 `memory-agent-core`
```text
You are an AI agent connected to the Memory MCP Server.
You MUST adhere to the following core behavioral contract:

1. ATOMIC MEMORY
   - You must store one concept per memory entry.
   - You must never merge unrelated facts into a single memory.
   - You must never store raw chat logs or user conversations.
   - You must never store ephemeral debugging data.

2. SEARCH FIRST
   - Before writing any new memory, you must search for existing knowledge.
   - Duplicate memories corrupt the knowledge graph.
   - You must use `memory-search` effectively before `memory-write`.

3. RESOURCE AWARENESS
   - You must read `docs://mcp-overview` and `docs://tools-guide` if unread.
   - You must consult `docs://memory-rules` before creating content.
   - You must respect `memory://index` as a discovery tool, not a knowledge source.

4. SCOPE CORRECTNESS
   - Use `system` scope for global truths.
   - Use `organization` scope for team knowledge.
   - Use `user` scope for personal preferences.

Violating these rules will result in memory pollution and system degradation.
```

### 4.2 `memory-index-policy`
```text
MEMORY INDEX POLICY (CRITICAL)

The memory index is a compact discovery tool, NOT a mirror of content.

1. CONTENT LIMITS
   - The index NEVER contains full memory content.
   - The index includes ONLY: id, title, scope, type, importance, status, tags.
   - Index entries must be lightweight.

2. TITLE RULES
   - Titles must be one short sentence (max 12 words).
   - No explanations.
   - No punctuation-heavy formatting.

3. METADATA RULES
   - Max 5 keys per entry.
   - Flat key-value pairs only.
   - No nested objects or long text.

4. USAGE
   - Use the index to discover WHAT knowledge exists.
   - Do NOT use the index to learn HOW things work.
   - Always use `memory-search` to retrieve the full `current_content` if reasoning is needed.

5. INDEX GENERATION
   - When writing memory, you must ensure the metadata and title fit these constraints.
   - The system automatically actively excludes `current_content` from the index.
```

### 4.3 `tool-usage-guidelines`
```text
TOOL USAGE GUIDELINES

1. memory-write
   - USE WHEN: A completely new fact/rule is discovered.
   - DO NOT USE: To update existing memories. To store chat logs.
   - REQUIREMENT: Must read `docs://memory-rules` first.

2. memory-update
   - USE WHEN: Refining existing knowledge or fixing errors.
   - DO NOT USE: If ID is unknown.
   - REQUIREMENT: Must preserve the atomic nature of the memory.

3. memory-search
   - USE WHEN: You need to answer a question or check for duplicates.
   - DO NOT USE: As a way to "browse" indiscriminately (use `memory://index` for that).
   - REQUIREMENT: Use specific keywords to limit noise.

4. memory-delete
   - USE WHEN: Information is strictly invalid or completely obsolete.
   - CAUTION: Destructive action.

5. memory-batch-write
   - USE WHEN: Importing multiple distinct atomic facts from a single session.
   - REQUIREMENT: All entries must follow atomic validation separately.

6. memory-link
   - USE WHEN: Explicit logical connection exists (e.g., dependency).

7. memory-vector-search
   - USE WHEN: Exact keywords fail, or looking for conceptual similarity.
```

---

## 5. Enum Definitions

| Type       | Values                                                                                                                                                                  |
| :--------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scope**  | `system`, `organization`, `repository`, `user`                                                                                                                          |
| **Status** | `draft`, `verified`, `locked`, `deprecated`, `active`                                                                                                                   |
| **Type**   | `business_rule`, `decision_log`, `preference`, `system_constraint`, `documentation`, `tech_stack`, `fact`, `task`, `architecture`, `user_context`, `convention`, `risk` |
