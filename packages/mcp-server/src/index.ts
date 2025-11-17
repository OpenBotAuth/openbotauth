#!/usr/bin/env node

/**
 * OpenBotAuth MCP Server
 * Exposes policy, metering, and payment tools via Model Context Protocol
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { Pool } from 'pg';
import { createClient } from 'redis';
import dotenv from 'dotenv';

import { PolicyTool } from './tools/policy.js';
import { PaymentsTool } from './tools/payments.js';
import { MeterTool } from './tools/meter.js';

// Load environment variables
dotenv.config();

/**
 * Initialize database connection
 */
function initDatabase(): Pool {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL?.includes('neon.tech')
      ? { rejectUnauthorized: false }
      : undefined,
  });

  return pool;
}

/**
 * Initialize Redis connection
 */
async function initRedis() {
  const redis = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  });

  redis.on('error', (err) => console.error('Redis error:', err));
  await redis.connect();

  return redis;
}

/**
 * Main server function
 */
async function main() {
  console.error('Starting OpenBotAuth MCP Server...');

  // Initialize connections
  const db = initDatabase();
  const redis = await initRedis();

  console.error('Database and Redis connected');

  // Initialize tools
  const policyTool = new PolicyTool(db, redis);
  const paymentsTool = new PaymentsTool(
    db,
    redis,
    process.env.PAYMENT_BASE_URL || 'http://localhost:8082'
  );
  const meterTool = new MeterTool(db, redis);

  console.error('Tools initialized');

  // Create MCP server
  const server = new Server(
    {
      name: 'openbotauth-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        policyTool.getDefinition(),
        paymentsTool.getDefinition(),
        meterTool.getDefinition(),
      ],
    };
  });

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'policy_apply':
          const policyResult = await policyTool.apply(args);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(policyResult, null, 2),
              },
            ],
          };

        case 'payments_create_intent':
          const paymentIntent = await paymentsTool.createIntent(args);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(paymentIntent, null, 2),
              },
            ],
          };

        case 'meter_ingest':
          const meterEvent = await meterTool.ingest(args);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(meterEvent, null, 2),
              },
            ],
          };

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  });

  // Start server with stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('OpenBotAuth MCP Server running on stdio');

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.error('Shutting down...');
    await redis.quit();
    await db.end();
    process.exit(0);
  });
}

// Run server
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

