/**
 * Example MCP Client
 * Demonstrates how to interact with the OpenBotAuth MCP Server
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

async function main() {
  console.log('🚀 Starting MCP Client Example\n');

  // Start MCP server as child process
  const serverProcess = spawn('node', ['../dist/index.js'], {
    stdio: ['pipe', 'pipe', 'inherit'],
  });

  // Create client transport
  const transport = new StdioClientTransport({
    command: 'node',
    args: ['../dist/index.js'],
  });

  // Create client
  const client = new Client(
    {
      name: 'openbotauth-test-client',
      version: '0.1.0',
    },
    {
      capabilities: {},
    }
  );

  // Connect
  await client.connect(transport);
  console.log('✅ Connected to MCP server\n');

  // List available tools
  const tools = await client.listTools();
  console.log('📋 Available tools:');
  tools.tools.forEach((tool) => {
    console.log(`  - ${tool.name}: ${tool.description}`);
  });
  console.log('');

  // Example 1: Check access policy
  console.log('🔐 Example 1: Check Access Policy');
  const policyResult = await client.callTool({
    name: 'policy_apply',
    arguments: {
      agent_id: 'http://localhost:8080/jwks/test-bot.json',
      resource_url: 'https://example.com/article/123',
      resource_type: 'post',
    },
  });
  console.log('Result:', JSON.parse(policyResult.content[0].text));
  console.log('');

  // Example 2: Create payment intent
  console.log('💰 Example 2: Create Payment Intent');
  const paymentResult = await client.callTool({
    name: 'payments_create_intent',
    arguments: {
      agent_id: 'http://localhost:8080/jwks/test-bot.json',
      resource_url: 'https://example.com/article/123',
      amount_cents: 500,
      currency: 'USD',
    },
  });
  console.log('Result:', JSON.parse(paymentResult.content[0].text));
  console.log('');

  // Example 3: Ingest meter event
  console.log('📊 Example 3: Ingest Meter Event');
  const meterResult = await client.callTool({
    name: 'meter_ingest',
    arguments: {
      agent_id: 'http://localhost:8080/jwks/test-bot.json',
      resource_url: 'https://example.com/article/123',
      event_type: 'access',
      metadata: {
        user_agent: 'test-client',
        ip: '127.0.0.1',
      },
    },
  });
  console.log('Result:', JSON.parse(meterResult.content[0].text));
  console.log('');

  // Cleanup
  await client.close();
  serverProcess.kill();
  console.log('✅ Client closed');
}

main().catch((error) => {
  console.error('❌ Error:', error);
  process.exit(1);
});

