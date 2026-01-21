import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, ".env") });

import readline from "node:readline";
import fetch from "node-fetch";

const DEFAULT_URL = "https://agent.idsolutions.id/api/v1/mcp/memory";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

// Capabilities definition matching PHP server tests
const CAPABILITIES = {
    capabilities: {
        resources: {
            list: true,
            read: true,
            templates: true
        },
        tools: {
            list: true,
            call: true
        },
        prompts: {
            list: true,
            get: true
        }
    },
    serverInfo: {
        name: "@vheins/memory-mcp",
        version: "1.0.0"
    },
    result: {
        serverInfo: {
            name: "@vheins/memory-mcp",
            version: "1.0.0"
        },
        capabilities: {
            resources: {
                list: true,
                read: true,
                templates: true
            },
            tools: {
                list: true,
                call: true
            },
            prompts: {
                list: true,
                get: true
            }
        },
        prompts: [
            {
                name: "memory-agent-core",
                description: "The core behavioral contract for all agents interacting with the Memory MCP."
            },
            {
                name: "memory-index-policy",
                description: "Enforces the strict policy regarding memory index usage and content."
            },
            {
                name: "tool-usage-guidelines",
                description: "Strict guidelines on when to use (and when NOT to use) each MCP tool."
            }
        ],
        tools: [
            {
                name: "memory-write",
                description: "Create a new memory entry. Supports facts, preferences, and business rules.",
                inputSchema: {
                    type: "object",
                    properties: {
                        organization: { type: "string", description: "The organization slug to which this memory belongs (e.g., \"my-org\"). Required for validation." },
                        scope_type: {
                            type: "string",
                            enum: ["system", "organization", "repository", "user"],
                            description: "The visibility scope: \"system\" for global rules, \"organization\" for team-wide knowledge, or \"user\" for private context."
                        },
                        memory_type: {
                            type: "string",
                            enum: ["business_rule", "decision_log", "preference", "system_constraint", "documentation", "tech_stack", "fact", "task", "architecture", "user_context", "convention", "risk"],
                            description: "The category of the memory: \"business_rule\", \"preference\", \"fact\", \"system_constraint\", etc."
                        },
                        current_content: { type: "string", description: "The actual content of the memory. Be precise and concise." },
                        id: { type: "string", format: "uuid", description: "UUID of the memory to update. Leave this field empty if you are creating a NEW memory entry." },
                        repository: { type: "string", description: "The specific repository slug (e.g., \"frontend-repo\") if this memory is project-specific." },
                        title: { type: "string", description: "A concise summary of the memory content. Rule: Max 12 words, no explanation, no proper sentences." },
                        status: {
                            type: "string",
                            enum: ["draft", "verified", "locked", "deprecated", "active"],
                            default: "draft",
                            description: "The lifecycle status: \"draft\" (default), \"active\" (verified), or \"archived\"."
                        },
                        importance: { type: "integer", minimum: 1, maximum: 10, default: 1, description: "Set the priority level (1-10). Default is 1. Higher values are returned first in searches." },
                        metadata: { type: "object", description: "Arbitrary JSON key-value pairs. Rule: Max 5 keys, flat key-values only, no nested objects, no long text." }
                    },
                    required: ["organization", "scope_type", "memory_type", "current_content"]
                }
            },
            {
                name: "memory-update",
                description: "Update an existing memory entry by its UUID.",
                inputSchema: {
                    type: "object",
                    properties: {
                        id: { type: "string", format: "uuid", description: "The unique UUID of the memory entry you wish to update." },
                        title: { type: "string", description: "A new summary title. Rule: Max 12 words, no explanation." },
                        current_content: { type: "string", description: "The new text content. Replaces the existing content entirely." },
                        status: {
                            type: "string",
                            enum: ["draft", "verified", "locked", "deprecated", "active"],
                            description: "Update the status (e.g., promote \"draft\" to \"active\" after verification)."
                        },
                        scope_type: {
                            type: "string",
                            enum: ["system", "organization", "repository", "user"],
                            description: "Change the visibility scope (e.g., move from \"user\" to \"organization\" for shared knowledge)."
                        },
                        memory_type: {
                            type: "string",
                            enum: ["business_rule", "decision_log", "preference", "system_constraint", "documentation", "tech_stack", "fact", "task", "architecture", "user_context", "convention", "risk"],
                            description: "Reclassify the memory type (e.g., from \"fact\" to \"business_rule\")."
                        },
                        importance: { type: "integer", minimum: 1, maximum: 10, description: "Adjust the priority level (1-10). Higher importance boosts vector search ranking." },
                        metadata: { type: "object", description: "Merge or replace metadata keys. Rule: Max 5 keys, flat key-values only, no nested objects." }
                    },
                    required: ["id"]
                }
            },
            {
                name: "memory-delete",
                description: "Soft-delete a memory entry by its UUID.",
                inputSchema: {
                    type: "object",
                    properties: {
                        id: { type: "string", format: "uuid", description: "The UUID of the memory entry to perform a soft-delete on." }
                    },
                    required: ["id"]
                }
            },
            {
                name: "memory-search",
                description: "Search for memories with hierarchical resolution and filtering.",
                inputSchema: {
                    type: "object",
                    properties: {
                        query: { type: "string", description: "The search query string. Use specific keywords to pinpoint relevant memories." },
                        queries: {
                            type: "array",
                            items: { type: "string" },
                            description: "Array of search queries or a single string queries. Used to perform multiple searches and merge results."
                        },
                        filters: {
                            type: "object",
                            properties: {
                                repository: { type: "string", description: "The specific repository to restrict the search to. Omit to search across all accessible repositories." },
                                memory_type: {
                                    type: "string",
                                    enum: ["business_rule", "decision_log", "preference", "system_constraint", "documentation", "tech_stack", "fact", "task", "architecture", "user_context", "convention", "risk"],
                                    description: "Filter by a specific memory category (e.g., \"business_rule\" for logic, \"system_constraint\" for immutable rules)."
                                },
                                status: {
                                    type: "string",
                                    enum: ["draft", "verified", "locked", "deprecated", "active"],
                                    description: "Filter by memory status (e.g., \"active\" for current knowledge, \"draft\" for works in progress)."
                                },
                                scope_type: {
                                    type: "string",
                                    enum: ["system", "organization", "repository", "user"],
                                    description: "Filter by scope (e.g., \"system\" for global rules, \"organization\" for team knowledge)."
                                },
                                metadata: { type: "object", description: "A JSON object to match against strict key-value pairs in the metadata column. Useful for tag-based filtering." }
                            },
                            description: "Optional filters to narrow down the search results."
                        }
                    }
                }
            },
            {
                name: "memory-link",
                description: "Create a relationship between two existing memories (Knowledge Graph).",
                inputSchema: {
                    type: "object",
                    properties: {
                        source_id: { type: "string", format: "uuid", description: "The UUID of the source memory (the starting point of the relationship)." },
                        target_id: { type: "string", format: "uuid", description: "The UUID of the target memory (the endpoint of the relationship)." },
                        relation_type: {
                            type: "string",
                            enum: ["related", "conflicts", "supports"],
                            default: "related",
                            description: "The nature of the relationship: \"related\" (neutral connection), \"conflicts\" (contradictory info), or \"supports\" (strengthens validation)."
                        }
                    },
                    required: ["source_id", "target_id"]
                }
            },
            {
                name: "memory-bulk-write",
                description: "Create or update multiple memory entries in a single batch.",
                inputSchema: {
                    type: "object",
                    properties: {
                        items: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    id: { type: "string", format: "uuid", description: "UUID for updating an existing memory. Omit for creating a new one." },
                                    organization: { type: "string", description: "The organization slug (required for new memories)." },
                                    repository: { type: "string", description: "The repository slug to associate with the memory." },
                                    scope_type: {
                                        type: "string",
                                        enum: ["system", "organization", "repository", "user"],
                                        description: "Visibility: \"system\", \"organization\", or \"user\"."
                                    },
                                    memory_type: {
                                        type: "string",
                                        enum: ["business_rule", "decision_log", "preference", "system_constraint", "documentation", "tech_stack", "fact", "task", "architecture", "user_context", "convention", "risk"],
                                        description: "Type: \"business_rule\", \"fact\", \"preference\", etc."
                                    },
                                    title: { type: "string", description: "A short, descriptive title." },
                                    current_content: { type: "string", description: "The main content of the memory." },
                                    status: {
                                        type: "string",
                                        enum: ["draft", "verified", "locked", "deprecated", "active"],
                                        description: "Status: \"draft\", \"active\", \"archived\"."
                                    },
                                    importance: { type: "number", minimum: 1, maximum: 10, description: "Priority level (1-10)." },
                                    metadata: { type: "object", description: "Custom key-value pairs." }
                                },
                                required: ["current_content"],
                                description: "A memory object to create or update."
                            },
                            description: "List of memory objects to process in batch."
                        }
                    },
                    required: ["items"]
                }
            },
            {
                name: "memory-vector-search",
                description: "Semantic search using vector embeddings. The client must provide the vector.",
                inputSchema: {
                    type: "object",
                    properties: {
                        vector: {
                            type: "array",
                            items: { type: "number" },
                            description: "The 1536-dimensional embedding vector representing the search query."
                        },
                        repository: { type: "string", description: "Limit search to a specific repository slug for context isolation." },
                        threshold: { type: "number", default: 0.5, description: "Similarity threshold (0.0 to 1.0). Higher values return closer matches but fewer results." },
                        filters: { type: "object", description: "Structured filters to refine results (e.g., {\"status\": \"active\"})." }
                    },
                    required: ["vector"]
                }
            },
            {
                name: "memory-audit",
                description: "Retrieve version history and audit logs for a memory.",
                inputSchema: {
                    type: "object",
                    properties: {
                        id: { type: "string", format: "uuid", description: "The UUID of the memory to fetch history for." }
                    },
                    required: ["id"]
                }
            },
            {
                name: "memory-index",
                description: "Lightweight discovery index of recent memories (metadata-only).",
                inputSchema: {
                    type: "object",
                    properties: {
                        // no params required for index listing; optional pagination/filtering may be supported server-side
                    }
                }
            }
        ],
        resources: [
            {
                uri: "memory://index",
                title: "Memory Index (sample)",
                description: "Sample lightweight index entry for discovery; real server returns dynamic results.",
                preview: { count: 10 }
            },
            {
                uri: "memory://123e4567-e89b-12d3-a456-426614174000",
                title: "Example Memory (sample)",
                description: "Example individual memory instance for local discovery and tests.",
                preview: { title: "Example Memory", snippet: "This is a sample memory used for testing." }
            },
            {
                uri: "docs://getting-started",
                title: "Getting Started",
                description: "Quickstart documentation for using the Memory MCP client and server.",
                preview: { slug: "getting-started" }
            },
            {
                uri: "schema://mcp",
                title: "MCP Schema",
                description: "Machine-readable schema describing tools, prompts and resources.",
                preview: { version: "1.0.0" }
            }
        ],
        resourceTemplates: [
            {
                uriTemplate: "memory://index",
                name: "Memory Index",
                description: "Discovery endpoint listing recent memories. Returns a JSON array of lightweight objects for topic discovery and de-duplication. NEVER contains full content."
            },
            {
                uriTemplate: "memory://{id}",
                name: "Individual Memory",
                description: "Read the full content and metadata of a specific memory entry."
            },
            {
                uriTemplate: "memory://{id}/history",
                name: "Memory Version History",
                description: "Retrieve full version history and audit logs for a memory. Useful for debugging or understanding how a memory evolved."
            },
            {
                uriTemplate: "docs://{slug}",
                name: "MCP Documentation",
                description: "Essential documentation for using this MCP server correctly."
            },
            {
                uriTemplate: "schema://mcp",
                name: "MCP Schema",
                description: "Schema endpoint exposing resource/tool/prompt schemas for clients and validators."
            }
        ]
    }
};

rl.on("line", async (line) => {
    if (!line.trim()) return;

    try {
        const msg = JSON.parse(line);

        if (msg.method === "initialize") {
            const response = {
                jsonrpc: "2.0",
                id: msg.id,
                result: {
                    capabilities: CAPABILITIES.capabilities,
                    serverInfo: CAPABILITIES.serverInfo,
                    protocolVersion: "2024-11-05"
                }
            };
            process.stdout.write(JSON.stringify(response) + "\n");
            // Send initialized notification
            process.stdout.write(JSON.stringify({
                jsonrpc: "2.0",
                method: "notifications/initialized",
                params: {}
            }) + "\n");
            return;
        }

        // Handle incoming initialized notification (no-op)
        if (msg.method === "notifications/initialized") {
            return;
        }

        // Handle list requests locally to advertise capabilities
        if (msg.method === "tools/list") {
            process.stdout.write(
                JSON.stringify({
                    jsonrpc: "2.0",
                    id: msg.id,
                    result: {
                        tools: CAPABILITIES.result.tools
                    }
                }) + "\n"
            );
            return;
        }

        if (msg.method === "resources/templates/list") {
            process.stdout.write(
                JSON.stringify({
                    jsonrpc: "2.0",
                    id: msg.id,
                    result: {
                        resourceTemplates: CAPABILITIES.result.resourceTemplates
                    }
                }) + "\n"
            );
            return;
        }

        if (msg.method === "prompts/list") {
            process.stdout.write(
                JSON.stringify({
                    jsonrpc: "2.0",
                    id: msg.id,
                    result: {
                        prompts: CAPABILITIES.result.prompts
                    }
                }) + "\n"
            );
            return;
        }

        // Return a single prompt by name (local cache) to help agents fetch full prompt text quickly
        if (msg.method === "prompts/get") {
            const name = msg.params && msg.params.name;
            const prompt = CAPABILITIES.result.prompts.find(p => p.name === name);
            if (prompt) {
                process.stdout.write(
                    JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { prompt } }) + "\n"
                );
                return;
            }
            // fall through to remote forward if not found locally
        }

        // Advertise static resources to the agent and allow reading them locally
        if (msg.method === "resources/list") {
            process.stdout.write(
                JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { resources: CAPABILITIES.result.resources } }) + "\n"
            );
            return;
        }

        if (msg.method === "resources/read") {
            const uri = msg.params && msg.params.uri;
            const resource = CAPABILITIES.result.resources.find(r => r.uri === uri);
            if (resource) {
                process.stdout.write(
                    JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { resource } }) + "\n"
                );
                return;
            }
            // fallback to remote for dynamic resources
        }

        async function forwardToMCP(method, params, id) {
            const url = process.env.MCP_MEMORY_URL || DEFAULT_URL;
            const token = process.env.MCP_MEMORY_TOKEN;

            if (!token) {
                const error = { code: -32000, message: "MCP_MEMORY_TOKEN is required but missing from environment" };
                process.stderr.write("FATAL: MCP_MEMORY_TOKEN is missing in environment\n");
                process.stdout.write(
                    JSON.stringify({ jsonrpc: "2.0", id, error }) + "\n"
                );
                return;
            }

            try {
                const headers = {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    "Authorization": `Bearer ${token}`
                };

                const res = await fetch(url, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ jsonrpc: "2.0", method, params, id })
                });

                const text = await res.text();
                let data = null;
                try {
                    data = JSON.parse(text);
                } catch (e) {
                    process.stderr.write(`Failed to parse remote response: ${text.substring(0, 500)}\n`);
                    const error = { code: -32700, message: "Parse error: Invalid JSON from server" };
                    process.stdout.write(
                        JSON.stringify({ jsonrpc: "2.0", id, error }) + "\n"
                    );
                    return;
                }

                // Forward the exact JSON-RPC envelope from server without mutation
                if (data.jsonrpc === "2.0" && data.id === id) {
                    process.stdout.write(JSON.stringify(data) + "\n");
                } else {
                    // Server returned malformed JSON-RPC - wrap it
                    process.stderr.write(`Server response missing JSON-RPC envelope\n`);
                    process.stdout.write(
                        JSON.stringify({ jsonrpc: "2.0", id, result: data }) + "\n"
                    );
                }
            } catch (e) {
                process.stderr.write(`Forwarding failed: ${e.message}\n`);
                const error = { code: -32603, message: `Internal error: ${e.message}` };
                process.stdout.write(
                    JSON.stringify({ jsonrpc: "2.0", id, error }) + "\n"
                );
            }
        }

        // Forward any JSON-RPC method other than initialize as-is
        const { method, params, id } = msg;
        await forwardToMCP(method, params, id);
        return;
    } catch (e) {
        process.stderr.write(`Parse error: ${e.message}\n`);
    }
});