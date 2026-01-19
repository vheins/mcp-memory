#!/usr/bin/env node

import readline from "node:readline";
import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
});

rl.on("line", async (line) => {
    if (!line.trim()) return;

    const msg = JSON.parse(line);

    if (msg.method === "initialize") {
        const url = process.env.MCP_MEMORY_URL;
        const token = process.env.MCP_MEMORY_TOKEN;
        let result = null;
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    method: "initialize",
                    params: {},
                    id: 1
                })
            });
            const data = await res.json();
            result = data.result;
        } catch (e) {
            console.error("API ERROR:", e);
        }
        process.stdout.write(JSON.stringify({
            jsonrpc: "2.0",
            id: msg.id,
            result
        }) + "\n");
        return;
    }



    // Helper to forward JSON-RPC to MCP API
    async function forwardToMCP(method, params, id) {
        const url = process.env.MCP_MEMORY_URL;
        const token = process.env.MCP_MEMORY_TOKEN;
        let result = null, error = null;
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ jsonrpc: "2.0", method, params, id: 1 })
            });
            const data = await res.json();
            result = data.result;
            error = data.error;
        } catch (e) {
            console.error("API ERROR:", e);
            error = { message: e.message };
        }
        process.stdout.write(JSON.stringify({
            jsonrpc: "2.0",
            id,
            ...(error ? { error } : { result })
        }) + "\n");
    }

    if (msg.method === "memory.store") {
        // Deprecated, but keep for compatibility
        await forwardToMCP("memory.store", msg.params, msg.id);
        return;
    }

    if (msg.method === "memory.write") {
        await forwardToMCP("memory.write", msg.params, msg.id);
        return;
    }

    if (msg.method === "memory.delete") {
        await forwardToMCP("memory.delete", msg.params, msg.id);
        return;
    }

    if (msg.method === "memory.search") {
        await forwardToMCP("memory.search", msg.params, msg.id);
        return;
    }

});
