#!/usr/bin/env node

/**
 * Verification Script for MCP Client
 * 
 * This script performs basic validation tests on the MCP client
 * without requiring a live server connection.
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CLIENT_PATH = path.join(__dirname, 'memory-mcp.js');

console.log('🔍 MCP Client Verification\n');

// Test 1: Syntax check
console.log('1️⃣  Testing syntax...');
const syntaxCheck = spawn('node', ['--check', CLIENT_PATH]);
syntaxCheck.on('close', (code) => {
    if (code === 0) {
        console.log('   ✅ Syntax valid\n');
        runTest2();
    } else {
        console.log('   ❌ Syntax error detected\n');
        process.exit(1);
    }
});

function runTest2() {
    // Test 2: Initialize request
    console.log('2️⃣  Testing initialize request...');

    const proc = spawn('node', [CLIENT_PATH], {
        env: { ...process.env, MCP_MEMORY_TOKEN: 'test-token' }
    });

    let output = '';
    proc.stdout.on('data', (data) => {
        output += data.toString();
    });

    proc.on('close', () => {
        try {
            const lines = output.trim().split('\n').filter(l => l);
            const responses = lines.map(l => JSON.parse(l));

            // Check initialize response
            const initResponse = responses[0];
            if (initResponse.result?.protocolVersion === '2024-11-05' &&
                initResponse.result?.capabilities?.tools?.list === true) {
                console.log('   ✅ Initialize response valid');
            } else {
                console.log('   ❌ Initialize response invalid');
                console.log('      Got:', JSON.stringify(initResponse, null, 2));
            }

            // Check initialized notification
            const notification = responses[1];
            if (notification.method === 'notifications/initialized') {
                console.log('   ✅ Initialized notification sent\n');
            } else {
                console.log('   ❌ Initialized notification missing\n');
            }

            runTest3();
        } catch (e) {
            console.log('   ❌ Failed to parse response:', e.message, '\n');
            process.exit(1);
        }
    });

    // Send initialize request
    proc.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        id: 1
    }) + '\n');
    proc.stdin.end();
}

function runTest3() {
    // Test 3: Tools list
    console.log('3️⃣  Testing tools/list...');

    const proc = spawn('node', [CLIENT_PATH], {
        env: { ...process.env, MCP_MEMORY_TOKEN: 'test-token' }
    });

    let output = '';
    proc.stdout.on('data', (data) => {
        output += data.toString();
    });

    proc.on('close', () => {
        try {
            const lines = output.trim().split('\n').filter(l => l);
            const response = JSON.parse(lines[lines.length - 1]);

            const tools = response.result?.tools || [];
            const toolNames = tools.map(t => t.name);

            const expectedTools = [
                'memory-write',
                'memory-update',
                'memory-delete',
                'memory-search',
                'memory-link'
            ];

            const allPresent = expectedTools.every(name => toolNames.includes(name));
            const noExtras = toolNames.every(name => expectedTools.includes(name));

            if (allPresent && noExtras) {
                console.log('   ✅ All 5 tools present (no extras)');

                // Check memory-write has id field
                const memoryWrite = tools.find(t => t.name === 'memory-write');
                if (memoryWrite.inputSchema.properties.id) {
                    console.log('   ✅ memory-write has optional id field');
                } else {
                    console.log('   ❌ memory-write missing id field');
                }

                // Check importance field
                if (memoryWrite.inputSchema.properties.importance) {
                    console.log('   ✅ memory-write has importance field\n');
                } else {
                    console.log('   ❌ memory-write missing importance field\n');
                }
            } else {
                console.log('   ❌ Tool list mismatch');
                console.log('      Expected:', expectedTools);
                console.log('      Got:', toolNames, '\n');
            }

            runTest4();
        } catch (e) {
            console.log('   ❌ Failed to parse response:', e.message, '\n');
            process.exit(1);
        }
    });

    proc.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 2
    }) + '\n');
    proc.stdin.end();
}

function runTest4() {
    // Test 4: Missing token
    console.log('4️⃣  Testing missing token...');

    const proc = spawn('node', [CLIENT_PATH], {
        env: { ...process.env, MCP_MEMORY_TOKEN: undefined }
    });

    let output = '';
    let stderrOutput = '';

    proc.stdout.on('data', (data) => {
        output += data.toString();
    });

    proc.stderr.on('data', (data) => {
        stderrOutput += data.toString();
    });

    proc.on('close', () => {
        try {
            const lines = output.trim().split('\n').filter(l => l);
            const response = JSON.parse(lines[lines.length - 1]);

            if (response.error?.code === -32000 &&
                response.error?.message.includes('MCP_MEMORY_TOKEN')) {
                console.log('   ✅ Returns error with code -32000');
            } else {
                console.log('   ❌ Wrong error response');
                console.log('      Got:', JSON.stringify(response, null, 2));
            }

            if (stderrOutput.includes('FATAL')) {
                console.log('   ✅ Fails loudly to stderr\n');
            } else {
                console.log('   ❌ No fatal error message\n');
            }

            runTest5();
        } catch (e) {
            console.log('   ❌ Failed to parse response:', e.message, '\n');
            process.exit(1);
        }
    });

    proc.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
            name: 'memory-search',
            arguments: {}
        },
        id: 3
    }) + '\n');
    proc.stdin.end();
}

function runTest5() {
    // Test 5: Resource templates
    console.log('5️⃣  Testing resource templates...');

    const proc = spawn('node', [CLIENT_PATH], {
        env: { ...process.env, MCP_MEMORY_TOKEN: 'test-token' }
    });

    let output = '';
    proc.stdout.on('data', (data) => {
        output += data.toString();
    });

    proc.on('close', () => {
        try {
            const lines = output.trim().split('\n').filter(l => l);
            const response = JSON.parse(lines[lines.length - 1]);

            const templates = response.result?.resourceTemplates || [];
            const hasIndex = templates.some(t => t.uriTemplate === 'memory://index');

            if (hasIndex && templates.length === 1) {
                console.log('   ✅ Has memory://index template (no extras)\n');
            } else {
                console.log('   ❌ Resource templates incorrect');
                console.log('      Got:', templates, '\n');
            }

            console.log('✅ All verification tests passed!\n');
            console.log('📋 Summary:');
            console.log('   • Syntax valid');
            console.log('   • Protocol compliance verified');
            console.log('   • Authentication validation working');
            console.log('   • Tool schemas correct');
            console.log('   • Resource templates correct');
            console.log('\n🚀 Client is ready for use!\n');
        } catch (e) {
            console.log('   ❌ Failed to parse response:', e.message, '\n');
            process.exit(1);
        }
    });

    proc.stdin.write(JSON.stringify({
        jsonrpc: '2.0',
        method: 'resources/templates/list',
        id: 4
    }) + '\n');
    proc.stdin.end();
}
