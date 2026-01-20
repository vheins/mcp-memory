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
                description: "Write a memory",
                inputSchema: {
                    type: "object",
                    properties: {
                        organization: { type: "string" },
                        scope_type: { type: "string" },
                        memory_type: { type: "string" },
                        current_content: { type: "string" },
                        repository: { type: "string" },
                        user_id: { type: "string" },
                        created_by_type: { type: "string" }
                    },
                    required: ["organization", "scope_type", "memory_type", "current_content"]
                }
            },
            {
                name: "memory-delete",
                description: "Delete a memory",
                inputSchema: {
                    type: "object",
                    properties: {
                        id: { type: "string" }
                    },
                    required: ["id"]
                }
            },
            {
                name: "memory-search",
                description: "Search memories",
                inputSchema: {
                    type: "object",
                    properties: {
                        repository: { type: "string" },
                        organization: { type: "string" },
                        query: { type: "string" },
                        filters: { type: "object" }
                    }
                }
            }
        ],
        resources: [
            // No static resources defined in tests, but capability is there
        ],
        resourceTemplates: [
            {
                uriTemplate: "memory://{id}",
                name: "memory",
                description: "Read a specific memory by ID"
            },
            {
                uriTemplate: "memory-history://{id}",
                name: "memory-history",
                description: "Read history of a memory"
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
                    protocolVersion: "2024-11-05" // Spec version
                }
            };
            process.stdout.write(JSON.stringify(response) + "\n");
            return;
        }

        // Initialize initialized
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
            const token = process.env.MCP_MEMORY_TOKEN || "";

            if (!token) {
                process.stderr.write("Error: MCP_MEMORY_TOKEN is missing in environment\n");
            }

            let result = null,
                error = null;
            try {
                const headers = {
                    "Content-Type": "application/json",
                    Accept: "application/json"
                };
                if (token) headers["Authorization"] = `Bearer ${token}`;

                process.stderr.write(`Forwarding ${method} to ${url}\n`);

                const res = await fetch(url, {
                    method: "POST",
                    headers,
                    body: JSON.stringify({ jsonrpc: "2.0", method, params, id })
                });

                const text = await res.text();
                process.stderr.write(`Remote response status: ${res.status}\n`);

                let data = null;
                try {
                    data = JSON.parse(text);
                } catch (e) {
                    process.stderr.write(`Failed to parse remote response: ${text.substring(0, 500)}\n`);
                    error = { code: -32000, message: "Invalid JSON response from server" };
                }

                if (!error) {
                    if (!res.ok) {
                        const message = (data && (data.message || data.error?.message)) || "HTTP error";
                        const code = res.status || data?.error?.code || -32001;
                        process.stderr.write(`Remote error: ${message} (code: ${code})\n`);
                        error = { code, message };
                    } else {
                        result = data?.result ?? null;
                        error = data?.error ?? null;
                    }
                }
            } catch (e) {
                process.stderr.write(`Forwarding failed: ${e.message}\n`);
                error = { code: -32002, message: e.message };
            }
            process.stdout.write(
                JSON.stringify({ jsonrpc: "2.0", id, ...(error ? { error } : { result }) }) + "\n"
            );
        }

        // Forward any JSON-RPC method other than initialize as-is
        const { method, params, id } = msg;
        await forwardToMCP(method, params, id);
        return;
    } catch (e) {
        process.stderr.write(`Parse error: ${e.message}\n`);
    }
});

