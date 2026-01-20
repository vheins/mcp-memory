import { spawn } from "child_process";
import path from "path";
import http from "http";

const MCP_CMD = path.resolve("./memory-mcp.js");

function startMockBackend() {
    const server = http.createServer(async (req, res) => {
        if (req.method !== "POST" || !req.url?.includes("/api/v1/mcp/memory")) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: "Not Found" }));
            return;
        }

        const auth = req.headers["authorization"] || "";
        const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!token) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: "Unauthenticated." }));
            return;
        }

        const userId = token.replace(/^token-/, "").trim() || "me";
        const chunks = [];
        for await (const c of req) chunks.push(c);
        let payload = {};
        try {
            payload = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ message: "Bad JSON" }));
            return;
        }

        const { id, method, params } = payload;
        const respond = (obj, status = 200) => {
            res.writeHead(status, { "Content-Type": "application/json" });
            res.end(JSON.stringify(obj));
        };

        if (method !== "tools/call") {
            respond({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } }, 200);
            return;
        }

        const name = params?.name;
        const args = params?.arguments || {};

        if (name === "memory-write") {
            const content = {
                user_id: userId,
                current_content: args.current_content ?? null,
                organization: args.organization,
                scope_type: args.scope_type,
                memory_type: args.memory_type
            };
            respond({
                jsonrpc: "2.0",
                id,
                result: {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(content)
                        }
                    ]
                }
            });
            return;
        }

        if (name === "memory-search") {
            const all = [
                { user_id: "user-a", current_content: "User A Secret" },
                { user_id: "user-b", current_content: "User B Secret" }
            ];
            // Simple mock filtering
            // In the real backend, if a user searches with a filter for ANOTHER user, it should likely return nothing or forbidden if unauthorized.
            // The test `testSearchScopesToAuthed` sends `filters: { user: "user-b" }` but uses token for `user-a`.
            // The expectation is that `user-a` CANNOT see `user-b`'s secret.

            let filtered = all;
            if (args.filters?.user) {
                // Simulate backend check: if requesting user != filter user, return empty or filtered to requesting user
                if (args.filters.user !== userId) {
                    // In strict mode this might be empty, but let's assume it returns what the USER owns matching the filter (which is none)
                    filtered = all.filter(m => m.user_id === userId && m.user_id === args.filters.user);
                } else {
                    filtered = all.filter(m => m.user_id === args.filters.user);
                }
            } else {
                filtered = all.filter(m => m.user_id === userId);
            }

            respond({
                jsonrpc: "2.0",
                id,
                result: {
                    content: [
                        {
                            type: "text",
                            text: JSON.stringify(filtered)
                        }
                    ]
                }
            });
            return;
        }

        if (name === "memory-delete") {
            // PHP test result: { id: 1 } or similar? 
            // The test says: assertJsonPath('id', 1) checks the RPC ID, not the result body content.
            // The test: assertSoftDeleted('memories', ...).
            // Usually returns success.
            respond({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: "Deleted" }] } });
            return;
        }
    });

    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
            const address = server.address();
            const port = typeof address === "object" && address ? address.port : 0;
            resolve({ server, port });
        });
    });
}

function runMCP(input, envOverrides = {}) {
    return new Promise((resolve) => {
        const proc = spawn("node", [MCP_CMD], {
            env: {
                ...process.env,
                ...envOverrides
            }
        });
        let output = "";
        proc.stdout.on("data", (data) => {
            output += data.toString();
        });
        proc.stderr.on("data", (data) => {
            // Intentionally quiet unless debugging
            // console.error("STDERR:", data.toString());
        });
        proc.on("close", () => {
            resolve(output.trim());
        });
        proc.stdin.write(JSON.stringify(input) + "\n");
        proc.stdin.end();
    });
}

async function testInitialize(env) {
    const input = { method: "initialize", id: 1 };
    const raw = await runMCP(input, env);
    const result = JSON.parse(raw);
    console.log("initialize:", JSON.stringify(result.result));

    // Assertions
    const caps = result.result.capabilities;
    if (!caps.tools?.list || !caps.resources?.list) {
        console.error("FAILED: Missing capabilities in hello response");
        process.exit(1);
    }
    if (result.result.serverInfo.name !== "@vheins/memory-mcp") {
        console.error("FAILED: Incorrect server name");
        process.exit(1);
    }
    console.log("initialize: OK");

    // Test tools/list
    const toolsInput = { method: "tools/list", id: 2 };
    const toolsRaw = await runMCP(toolsInput, env);
    const toolsRes = JSON.parse(toolsRaw);
    const toolNames = toolsRes.result.tools.map(t => t.name);
    if (!toolNames.includes("memory-write") || !toolNames.includes("memory-delete")) {
        console.error("FAILED: Missing expected tools", toolNames);
        process.exit(1);
    }
    console.log("tools/list: OK");
}

async function testRequiresAuth(baseEnv) {
    const input = {
        method: "tools/call",
        params: { name: "memory-search", arguments: { repository: "repo-id" } },
        id: 11
    };
    const raw = await runMCP(input, { ...baseEnv, MCP_MEMORY_TOKEN: "" });
    const out = JSON.parse(raw);
    if (!out.error || out.error.code !== 401) {
        console.error("Auth test failed:", out);
    } else {
        console.log("requires-auth: OK (", out.error.code, ")");
    }
}

async function testWriteScopesToAuthed(baseEnv) {
    const input = {
        method: "tools/call",
        params: {
            name: "memory-write",
            arguments: {
                organization: "org",
                repository: "repo",
                scope_type: "user",
                memory_type: "preference",
                current_content: "My Preference",
                user: "user-b" // spoof attempt
            }
        },
        id: 12
    };
    const raw = await runMCP(input, baseEnv);
    const out = JSON.parse(raw);
    if (out.error) {
        console.error("write error:", out.error);
        return;
    }
    const text = out.result?.content?.[0]?.text || "{}";
    const data = JSON.parse(text);
    if (data.user_id === "user-a" && data.user_id !== "user-b") {
        console.log("write-scopes: OK");
    } else {
        console.error("write-scopes: FAILED", data);
    }
}

async function testSearchScopesToAuthed(baseEnv) {
    const input = {
        method: "tools/call",
        params: {
            name: "memory-search",
            arguments: {
                repository: "repo",
                filters: { user: "user-b" } // spoof attempt
            }
        },
        id: 13
    };
    const raw = await runMCP(input, baseEnv);
    const out = JSON.parse(raw);
    if (out.error) {
        console.error("search error:", out.error);
        return;
    }
    const text = out.result?.content?.[0]?.text || "[]";
    const arr = JSON.parse(text);
    const hasA = arr.some((x) => x.current_content === "User A Secret");
    const hasB = arr.some((x) => x.current_content === "User B Secret");
    if (hasA && !hasB) {
        console.log("search-scopes: OK");
    } else {
        console.error("search-scopes: FAILED", arr);
    }
}

async function testDelete(baseEnv) {
    const input = { method: "tools/call", params: { name: "memory-delete", arguments: { id: "1" } }, id: 14 };
    const raw = await runMCP(input, baseEnv);
    const out = JSON.parse(raw);
    if (out.error) console.error("delete error:", out.error);
    else console.log("delete:", JSON.stringify(out.result));
}

async function testStore(baseEnv) {
    const input = {
        method: "tools/call",
        params: { name: "memory-store", arguments: { current_content: "Legacy", memory_type: "fact" } },
        id: 15
    };
    const raw = await runMCP(input, baseEnv);
    const out = JSON.parse(raw);
    if (out.error) console.error("store error:", out.error);
    else console.log("store:", JSON.stringify(out.result));
}

async function runAllTests() {
    const { server, port } = await startMockBackend();
    const baseEnv = {
        MCP_MEMORY_URL: `http://127.0.0.1:${port}/api/v1/mcp/memory`,
        MCP_MEMORY_TOKEN: "token-user-a"
    };
    try {
        await testInitialize(baseEnv);
        await testRequiresAuth(baseEnv);
        await testWriteScopesToAuthed(baseEnv);
        await testSearchScopesToAuthed(baseEnv);
        await testDelete(baseEnv);
        await testStore(baseEnv);
    } finally {
        server.close();
    }
}

runAllTests();
