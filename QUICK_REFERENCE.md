# Quick Reference: MCP Client Implementation

## 🎯 Core Contract Points

### Tools (5 total)
1. `memory-write` - Create/upsert (with optional `id`)
2. `memory-update` - Update existing by UUID
3. `memory-delete` - Soft-delete by UUID
4. `memory-search` - Search with filters
5. `memory-link` - Create relationships

### Enums

**scope_type:**
- `system`
- `organization`
- `repository`
- `user`

**memory_type:**
- `business_rule`
- `decision_log`
- `preference`
- `system_constraint`
- `documentation`
- `tech_stack`
- `fact`
- `task`
- `architecture`
- `user_context`
- `convention`
- `risk`

**status:**
- `draft` (default)
- `verified`
- `locked`
- `deprecated`
- `active`

---

## 🔑 Key Implementation Details

### Authentication
```javascript
// MUST fail immediately if missing
const token = process.env.MCP_MEMORY_TOKEN;
if (!token) {
  return error(-32000, "MCP_MEMORY_TOKEN is required but missing");
}

// Use Bearer token
headers["Authorization"] = `Bearer ${token}`;
```

### Response Forwarding
```javascript
// ✅ CORRECT: Forward exact envelope
process.stdout.write(JSON.stringify(data) + "\n");

// ❌ WRONG: Extracting result
process.stdout.write(JSON.stringify({ result: data.result }) + "\n");
```

### Initialization
```javascript
// Step 1: Respond to initialize
process.stdout.write(JSON.stringify({
  jsonrpc: "2.0",
  id: msg.id,
  result: {
    capabilities: {...},
    serverInfo: {...},
    protocolVersion: "2024-11-05"
  }
}) + "\n");

// Step 2: Send initialized notification
process.stdout.write(JSON.stringify({
  jsonrpc: "2.0",
  method: "notifications/initialized",
  params: {}
}) + "\n");
```

---

## 🚫 Forbidden Actions

1. ❌ Transform snake_case ↔ camelCase
2. ❌ Extract `content[].text` from responses
3. ❌ Add default values not in schema
4. ❌ Cache responses
5. ❌ Retry failed requests
6. ❌ Validate memory content
7. ❌ Normalize response structure
8. ❌ Store state between requests

---

## 📏 Schema Key Points

### memory-write
- `id` is **optional** (for upsert)
- `importance` defaults to 1 (1-10 range)
- `status` defaults to "draft"
- Required: `organization`, `scope_type`, `memory_type`, `current_content`

### memory-update
- Can update: `title`, `current_content`, `status`, `scope_type`, `memory_type`, `importance`, `metadata`
- Only `id` is required

### memory-search
- `query` is optional (can filter without search)
- `filters` object structure:
  - `repository`
  - `memory_type`
  - `status`
  - `scope_type`
  - `metadata`

---

## 🔍 Debugging

### Check Token
```bash
echo $MCP_MEMORY_TOKEN
# Should output your token, not empty
```

### Test Syntax
```bash
node --check memory-mcp.js
# Should produce no output (success)
```

### Run with Inspector
```bash
export MCP_MEMORY_TOKEN="your-token"
npx @modelcontextprotocol/inspector node memory-mcp.js
```

### Check Request/Response
```bash
# Server errors written to stderr
# JSON-RPC responses written to stdout
```

---

## 📊 Success Metrics

**Implementation is valid if:**
1. MCP Inspector shows all 5 tools ✅
2. Tool schemas match contract exactly ✅
3. Authentication fails loudly when missing ✅
4. Responses forwarded without mutation ✅
5. Alternative client produces identical behavior ✅

---

## 🧠 Mental Model

```
STDIN (MCP) → [Transparent Pipe] → HTTP (Laravel)
              ↓
              No Logic
              No Caching
              No Transformation
              ↓
HTTP (Laravel) → [Transparent Pipe] → STDOUT (MCP)
```

**The client is NOT smart. It is PRECISE.**

---

## 🎯 One-Sentence Summary

> A stateless STDIO↔HTTP adapter that forwards JSON-RPC requests/responses between MCP clients and the Laravel Memory server without any transformation or interpretation.

---

## 🔗 Related Files

- [mcp-contract.md](./mcp-contract.md) - Full contract specification
- [README.md](./README.md) - User documentation
- [VALIDATION.md](./VALIDATION.md) - Validation checklist
- [memory-mcp.js](./memory-mcp.js) - Implementation
