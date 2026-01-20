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
            }
        },
        tools: [
            {
                name: "memory-write",
                description: "Create or update a memory entry. Supports facts, preferences, and business rules.",
                inputSchema: {
                    type: "object",
                    properties: {
                        organization: { type: "string" },
                        scope_type: { type: "string", enum: ["system", "organization", "repository", "user"] },
                        memory_type: { type: "string", enum: ["business_rule", "decision_log", "preference", "system_constraint", "documentation", "tech_stack", "fact", "task", "architecture", "user_context", "convention", "risk"] },
                        current_content: { type: "string" },
                        id: { type: "string", format: "uuid" },
                        repository: { type: "string" },
                        title: { type: "string" },
                        status: { type: "string", enum: ["draft", "verified", "locked", "deprecated", "active"], default: "draft" },
                        importance: { type: "integer", minimum: 1, maximum: 10, default: 1 },
                        metadata: { type: "object" }
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
                        id: { type: "string", format: "uuid" },
                        title: { type: "string" },
                        current_content: { type: "string" },
                        status: { type: "string", enum: ["draft", "verified", "locked", "deprecated", "active"] },
                        scope_type: { type: "string", enum: ["system", "organization", "repository", "user"] },
                        memory_type: { type: "string", enum: ["business_rule", "decision_log", "preference", "system_constraint", "documentation", "tech_stack", "fact", "task", "architecture", "user_context", "convention", "risk"] },
                        importance: { type: "integer", minimum: 1, maximum: 10 },
                        metadata: { type: "object" }
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
                        id: { type: "string", format: "uuid" }
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
                        query: { type: "string" },
                        filters: {
                            type: "object",
                            properties: {
                                repository: { type: "string" },
                                memory_type: { type: "string", enum: ["business_rule", "decision_log", "preference", "system_constraint", "documentation", "tech_stack", "fact", "task", "architecture", "user_context", "convention", "risk"] },
                                status: { type: "string", enum: ["draft", "verified", "locked", "deprecated", "active"] },
                                scope_type: { type: "string", enum: ["system", "organization", "repository", "user"] },
                                metadata: { type: "object" }
                            }
                        }
                    }
                }
            },
            {
                name: "memory-link",
                description: "Create relationships between memories.",
                inputSchema: {
                    type: "object",
                    properties: {
                        source_id: { type: "string", format: "uuid" },
                        target_id: { type: "string", format: "uuid" },
                        relation_type: { type: "string", default: "related" }
                    },
                    required: ["source_id", "target_id"]
                }
            }
        ],
        resources: [
            // No static resources defined in tests, but capability is there
        ],
        resourceTemplates: [
            {
                uriTemplate: "memory://index",
                name: "Memory Index",
                description: "Discovery endpoint - lightweight list of 50 most recent memories (excludes current_content)"
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

