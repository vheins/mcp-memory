import readline from "node:readline";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const DEFAULT_URL = "http://localhost:8000/api/v1/mcp/memory";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

rl.on("line", async (line) => {
    if (!line.trim()) return;

    try {
        const msg = JSON.parse(line);

        if (msg.method === "initialize") {
            process.stdout.write(
                JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { success: true } }) +
                "\n"
            );
            return;
        }

        async function forwardToMCP(method, params, id) {
            const url = process.env.MCP_MEMORY_URL || DEFAULT_URL;
            const token = process.env.MCP_MEMORY_TOKEN || "";
            let result = null,
                error = null;
            try {
                const headers = {
                    "Content-Type": "application/json",
                    Accept: "application/json"
                };
                if (token) headers["Authorization"] = `Bearer ${token}`;

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
                    error = { code: -32000, message: "Invalid JSON response from server" };
                }

                if (!error) {
                    if (!res.ok) {
                        const message = (data && (data.message || data.error?.message)) || "HTTP error";
                        const code = res.status || data?.error?.code || -32001;
                        error = { code, message };
                    } else {
                        result = data?.result ?? null;
                        error = data?.error ?? null;
                    }
                }
            } catch (e) {
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
