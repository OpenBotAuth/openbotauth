/**
 * Payments Tool
 * Creates payment intents for paid content access
 */

import type { Pool } from 'pg';
import type { RedisClientType } from 'redis';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import type { PaymentIntent } from '../types/index.js';

const CreatePaymentIntentSchema = z.object({
  agent_id: z.string().describe('Agent identifier (JWKS URL or kid)'),
  resource_url: z.string().url().describe('URL of the resource to purchase'),
  amount_cents: z.number().int().positive().describe('Amount in cents'),
  currency: z.string().default('USD').describe('Currency code (USD, EUR, etc.)'),
  metadata: z.record(z.any()).optional().describe('Additional metadata'),
});

export class PaymentsTool {
  constructor(
    private db: Pool,
    private redis: RedisClientType,
    private paymentBaseUrl: string
  ) {}

  /**
   * Get tool definition for MCP
   */
  getDefinition() {
    return {
      name: 'payments_create_intent',
      description: 'Create a payment intent for an agent to purchase access to a resource. Returns a payment URL and intent ID.',
      inputSchema: {
        type: 'object',
        properties: {
          agent_id: {
            type: 'string',
            description: 'Agent identifier (JWKS URL or kid)',
          },
          resource_url: {
            type: 'string',
            description: 'URL of the resource to purchase',
          },
          amount_cents: {
            type: 'number',
            description: 'Amount in cents',
          },
          currency: {
            type: 'string',
            description: 'Currency code (USD, EUR, etc.)',
            default: 'USD',
          },
          metadata: {
            type: 'object',
            description: 'Additional metadata',
          },
        },
        required: ['agent_id', 'resource_url', 'amount_cents'],
      },
    };
  }

  /**
   * Create payment intent
   */
  async createIntent(input: unknown): Promise<PaymentIntent> {
    // Validate input
    const request = CreatePaymentIntentSchema.parse(input);

    // Generate payment intent
    const intentId = randomUUID();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000); // 24 hours

    const intent: PaymentIntent = {
      id: intentId,
      agent_id: request.agent_id,
      resource_url: request.resource_url,
      amount_cents: request.amount_cents,
      currency: request.currency,
      status: 'pending',
      pay_url: this.generatePaymentUrl(intentId, request),
      created_at: createdAt.toISOString(),
      expires_at: expiresAt.toISOString(),
    };

    // Store in database
    await this.db.query(
      `INSERT INTO payment_intents 
       (id, agent_id, resource_url, amount_cents, currency, status, pay_url, metadata, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        intent.id,
        intent.agent_id,
        intent.resource_url,
        intent.amount_cents,
        intent.currency,
        intent.status,
        intent.pay_url,
        JSON.stringify(request.metadata || {}),
        createdAt,
        expiresAt,
      ]
    );

    // Cache intent for quick lookup
    await this.redis.setEx(
      `payment_intent:${intentId}`,
      86400, // 24 hours
      JSON.stringify(intent)
    );

    return intent;
  }

  /**
   * Get payment intent by ID
   */
  async getIntent(intentId: string): Promise<PaymentIntent | null> {
    // Try cache first
    const cached = await this.redis.get(`payment_intent:${intentId}`);
    if (cached) {
      return JSON.parse(cached);
    }

    // Query database
    const result = await this.db.query(
      `SELECT * FROM payment_intents WHERE id = $1`,
      [intentId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    const intent: PaymentIntent = {
      id: row.id,
      agent_id: row.agent_id,
      resource_url: row.resource_url,
      amount_cents: row.amount_cents,
      currency: row.currency,
      status: row.status,
      pay_url: row.pay_url,
      created_at: row.created_at.toISOString(),
      expires_at: row.expires_at.toISOString(),
    };

    return intent;
  }

  /**
   * Mark payment as completed
   */
  async completePayment(intentId: string): Promise<void> {
    // Update database
    await this.db.query(
      `UPDATE payment_intents SET status = 'paid', paid_at = NOW() WHERE id = $1`,
      [intentId]
    );

    // Get intent to update cache
    const intent = await this.getIntent(intentId);
    if (intent) {
      intent.status = 'paid';

      // Update intent cache
      await this.redis.setEx(
        `payment_intent:${intentId}`,
        86400,
        JSON.stringify(intent)
      );

      // Grant access
      const accessKey = `payment:${intent.agent_id}:${intent.resource_url}`;
      await this.redis.setEx(
        accessKey,
        30 * 24 * 60 * 60, // 30 days
        'paid'
      );
    }
  }

  /**
   * Generate payment URL
   */
  private generatePaymentUrl(
    intentId: string,
    request: z.infer<typeof CreatePaymentIntentSchema>
  ): string {
    const params = new URLSearchParams({
      intent_id: intentId,
      agent_id: request.agent_id,
      resource_url: request.resource_url,
      amount: request.amount_cents.toString(),
      currency: request.currency,
    });

    return `${this.paymentBaseUrl}/pay?${params.toString()}`;
  }

  /**
   * Verify payment receipt
   */
  async verifyReceipt(intentId: string, _receipt: string): Promise<boolean> {
    // Get intent
    const intent = await this.getIntent(intentId);
    if (!intent) {
      return false;
    }

    // In production, verify receipt signature
    // For now, just check if intent exists and is paid
    return intent.status === 'paid';
  }

  /**
   * List payment intents for agent
   */
  async listIntents(agentId: string, limit = 10): Promise<PaymentIntent[]> {
    const result = await this.db.query(
      `SELECT * FROM payment_intents 
       WHERE agent_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [agentId, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      agent_id: row.agent_id,
      resource_url: row.resource_url,
      amount_cents: row.amount_cents,
      currency: row.currency,
      status: row.status,
      pay_url: row.pay_url,
      created_at: row.created_at.toISOString(),
      expires_at: row.expires_at.toISOString(),
    }));
  }
}

