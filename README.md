# Memory MCP Client

A **strict, transparent MCP client** for the Laravel Memory MCP Server.

This client implements the [Model Context Protocol (MCP)](https://modelcontextprotocol.io) version `2024-11-05` and acts as a **zero-logic transport adapter** between STDIO and the Laravel Memory HTTP API.

---

## 🔐 Core Principles

This client follows the **Zero-Assumption Policy**:

- ✅ **Forwards** requests and responses without mutation
- ✅ **Preserves** exact JSON-RPC envelopes from server
- ✅ **Validates** authentication strictly (fails immediately if token missing)
- ✅ **Mirrors** tool schemas exactly from contract
- ❌ **Never** transforms, normalizes, or interprets data
- ❌ **Never** caches or stores responses
- ❌ **Never** adds business logic

---

## 📦 Installation

```bash
npm install
```

---

## ⚙️ Configuration

### Required Environment Variables

```bash
# REQUIRED: Bearer token for authentication
MCP_MEMORY_TOKEN=your-token-here
```

### Optional Environment Variables

```bash
# Server URL (default: https://agent.idsolutions.id/api/v1/mcp/memory)
MCP_MEMORY_URL=https://your-server.com/api/v1/mcp/memory
```

**Important**: The client will **fail immediately** with a fatal error if `MCP_MEMORY_TOKEN` is not set.

---

## 🚀 Usage

### As MCP Server (via STDIO)

```bash
# Set environment variables
export MCP_MEMORY_TOKEN="your-token"

# Run the client
node memory-mcp.js

# Or use the bin script
./bin/memory-mcp.js
```

### With MCP Inspector

```bash
npx @modelcontextprotocol/inspector node memory-mcp.js
```

---

## 🛠️ Available Tools

The client exposes the following tools from the Laravel Memory MCP Server:

| Tool            | Description                                                |
| --------------- | ---------------------------------------------------------- |
| `memory-write`  | Create or update a memory entry (upsert via optional `id`) |
| `memory-update` | Update an existing memory by UUID                          |
| `memory-delete` | Soft-delete a memory entry                                 |
| `memory-search` | Search memories with filtering                             |
| `memory-link`   | Create relationships between memories                      |

For complete schema definitions, see [mcp-contract.md](./mcp-contract.md).

---

## 📋 Protocol Behavior

### Initialization

1. Client receives `initialize` request
2. Client responds with capabilities and `protocolVersion: "2024-11-05"`
3. Client sends `notifications/initialized` notification

### Tool Invocation

All tool calls follow this pattern:

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "memory-write",
    "arguments": { ... }
  },
  "id": 1
}
```

The client:
1. Validates `MCP_MEMORY_TOKEN` exists (fails if missing)
2. Forwards request to Laravel server via HTTP POST
3. Returns **exact** JSON-RPC envelope from server (no transformation)

### Error Handling

- **Missing token**: Returns JSON-RPC error with code `-32000`
- **Parse errors**: Returns JSON-RPC error with code `-32700`
- **Network errors**: Returns JSON-RPC error with code `-32603`
- **Server errors**: Forwarded exactly as received

---

## 🧪 Testing

```bash
node test-memory-mcp.js
```

---

## 📘 Contract Adherence

This client strictly implements the contract specified in [mcp-contract.md](./mcp-contract.md).

Key adherence points:

- ✅ All tool schemas match contract exactly (including enums, formats, required fields)
- ✅ Authentication uses Bearer token in `Authorization` header
- ✅ Responses are forwarded without extracting or transforming `content` arrays
- ✅ No local caching or state management
- ✅ No schema normalization or field renaming
- ✅ Idempotency rules defined by server, not client

---

## 🚫 What This Client Does NOT Do

- ❌ Store or cache memories
- ❌ Interpret memory semantics
- ❌ Modify or validate memory content
- ❌ Auto-retry failed requests
- ❌ Transform snake_case ↔ camelCase
- ❌ Extract or parse `content[].text` from responses
- ❌ Add default values not specified in contract
- ❌ Implement business logic

**If you need logic, it belongs in the agent using this client.**

---

## 🔍 Validation Checklist

Before considering this implementation complete, verify:

- [ ] MCP Inspector lists all 5 tools correctly
- [ ] `tools/list` schema matches server exactly
- [ ] Resource templates are visible (`memory://index`)
- [ ] `tools/call` forwards requests without mutation
- [ ] Server errors propagate unchanged
- [ ] No schema transformation occurs
- [ ] Token validation fails loudly when missing

---

## 📖 Mental Model

Think of this client as:

> **A transparent glass pipe.**

Not smart. Not opinionated. Only precise.

The client's only job is to translate between STDIO (MCP protocol) and HTTP (Laravel API) while preserving all semantics.

---

## 🤝 Replacement Test

The implementation is correct if:

**Replacing this client with another implementation produces zero behavioral difference.**

If swapping clients changes system behavior, something is wrong.

---

## 📄 License

See repository license.
