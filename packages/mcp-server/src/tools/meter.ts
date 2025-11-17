/**
 * Meter Tool
 * Ingests and tracks usage metrics for agents
 */

import type { Pool } from 'pg';
import type { RedisClientType } from 'redis';
import { z } from 'zod';
import type { MeterEvent } from '../types/index.js';

const MeterIngestSchema = z.object({
  agent_id: z.string().describe('Agent identifier (JWKS URL or kid)'),
  resource_url: z.string().url().describe('URL of the resource accessed'),
  event_type: z
    .enum(['access', 'payment', 'denial', 'rate_limit'])
    .describe('Type of event'),
  metadata: z.record(z.any()).optional().describe('Additional event metadata'),
});

export class MeterTool {
  constructor(
    private db: Pool,
    private redis: RedisClientType
  ) {}

  /**
   * Get tool definition for MCP
   */
  getDefinition() {
    return {
      name: 'meter_ingest',
      description: 'Ingest a usage event for metering and analytics. Tracks agent access, payments, denials, and rate limits.',
      inputSchema: {
        type: 'object',
        properties: {
          agent_id: {
            type: 'string',
            description: 'Agent identifier (JWKS URL or kid)',
          },
          resource_url: {
            type: 'string',
            description: 'URL of the resource accessed',
          },
          event_type: {
            type: 'string',
            enum: ['access', 'payment', 'denial', 'rate_limit'],
            description: 'Type of event',
          },
          metadata: {
            type: 'object',
            description: 'Additional event metadata',
          },
        },
        required: ['agent_id', 'resource_url', 'event_type'],
      },
    };
  }

  /**
   * Ingest a meter event
   */
  async ingest(input: unknown): Promise<MeterEvent> {
    // Validate input
    const request = MeterIngestSchema.parse(input);

    const event: MeterEvent = {
      agent_id: request.agent_id,
      resource_url: request.resource_url,
      event_type: request.event_type,
      metadata: request.metadata,
      timestamp: new Date().toISOString(),
    };

    // Store in database
    await this.db.query(
      `INSERT INTO meter_events 
       (agent_id, resource_url, event_type, metadata, timestamp)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        event.agent_id,
        event.resource_url,
        event.event_type,
        JSON.stringify(event.metadata || {}),
        event.timestamp,
      ]
    );

    // Update counters in Redis
    await this.updateCounters(event);

    return event;
  }

  /**
   * Update Redis counters for analytics
   */
  private async updateCounters(event: MeterEvent): Promise<void> {
    const date = new Date(event.timestamp).toISOString().split('T')[0]; // YYYY-MM-DD

    // Increment counters
    await Promise.all([
      // Total events by agent
      this.redis.incr(`meter:agent:${event.agent_id}:total`),

      // Events by type
      this.redis.incr(`meter:agent:${event.agent_id}:${event.event_type}`),

      // Daily events
      this.redis.incr(`meter:agent:${event.agent_id}:${date}:total`),
      this.redis.incr(`meter:agent:${event.agent_id}:${date}:${event.event_type}`),

      // Resource access count
      this.redis.incr(`meter:resource:${event.resource_url}:total`),
      this.redis.incr(`meter:resource:${event.resource_url}:${event.event_type}`),

      // Global counters
      this.redis.incr(`meter:global:${event.event_type}`),
      this.redis.incr(`meter:global:${date}:${event.event_type}`),
    ]);

    // Set expiry on daily keys (30 days)
    await this.redis.expire(`meter:agent:${event.agent_id}:${date}:total`, 30 * 24 * 60 * 60);
    await this.redis.expire(
      `meter:agent:${event.agent_id}:${date}:${event.event_type}`,
      30 * 24 * 60 * 60
    );
    await this.redis.expire(`meter:global:${date}:${event.event_type}`, 30 * 24 * 60 * 60);
  }

  /**
   * Get agent statistics
   */
  async getAgentStats(agentId: string): Promise<{
    total: number;
    access: number;
    payment: number;
    denial: number;
    rate_limit: number;
  }> {
    const [total, access, payment, denial, rateLimit] = await Promise.all([
      this.redis.get(`meter:agent:${agentId}:total`),
      this.redis.get(`meter:agent:${agentId}:access`),
      this.redis.get(`meter:agent:${agentId}:payment`),
      this.redis.get(`meter:agent:${agentId}:denial`),
      this.redis.get(`meter:agent:${agentId}:rate_limit`),
    ]);

    return {
      total: parseInt(total || '0'),
      access: parseInt(access || '0'),
      payment: parseInt(payment || '0'),
      denial: parseInt(denial || '0'),
      rate_limit: parseInt(rateLimit || '0'),
    };
  }

  /**
   * Get resource statistics
   */
  async getResourceStats(resourceUrl: string): Promise<{
    total: number;
    access: number;
    payment: number;
    denial: number;
    rate_limit: number;
  }> {
    const [total, access, payment, denial, rateLimit] = await Promise.all([
      this.redis.get(`meter:resource:${resourceUrl}:total`),
      this.redis.get(`meter:resource:${resourceUrl}:access`),
      this.redis.get(`meter:resource:${resourceUrl}:payment`),
      this.redis.get(`meter:resource:${resourceUrl}:denial`),
      this.redis.get(`meter:resource:${resourceUrl}:rate_limit`),
    ]);

    return {
      total: parseInt(total || '0'),
      access: parseInt(access || '0'),
      payment: parseInt(payment || '0'),
      denial: parseInt(denial || '0'),
      rate_limit: parseInt(rateLimit || '0'),
    };
  }

  /**
   * Get daily stats for agent
   */
  async getAgentDailyStats(
    agentId: string,
    days = 7
  ): Promise<Array<{ date: string; total: number; by_type: Record<string, number> }>> {
    const stats = [];
    const today = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      const [total, access, payment, denial, rateLimit] = await Promise.all([
        this.redis.get(`meter:agent:${agentId}:${dateStr}:total`),
        this.redis.get(`meter:agent:${agentId}:${dateStr}:access`),
        this.redis.get(`meter:agent:${agentId}:${dateStr}:payment`),
        this.redis.get(`meter:agent:${agentId}:${dateStr}:denial`),
        this.redis.get(`meter:agent:${agentId}:${dateStr}:rate_limit`),
      ]);

      stats.push({
        date: dateStr,
        total: parseInt(total || '0'),
        by_type: {
          access: parseInt(access || '0'),
          payment: parseInt(payment || '0'),
          denial: parseInt(denial || '0'),
          rate_limit: parseInt(rateLimit || '0'),
        },
      });
    }

    return stats.reverse(); // Oldest first
  }

  /**
   * Query events from database
   */
  async queryEvents(filters: {
    agent_id?: string;
    resource_url?: string;
    event_type?: string;
    start_date?: string;
    end_date?: string;
    limit?: number;
  }): Promise<MeterEvent[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.agent_id) {
      conditions.push(`agent_id = $${paramIndex++}`);
      params.push(filters.agent_id);
    }

    if (filters.resource_url) {
      conditions.push(`resource_url = $${paramIndex++}`);
      params.push(filters.resource_url);
    }

    if (filters.event_type) {
      conditions.push(`event_type = $${paramIndex++}`);
      params.push(filters.event_type);
    }

    if (filters.start_date) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      params.push(filters.start_date);
    }

    if (filters.end_date) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      params.push(filters.end_date);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit || 100;

    const query = `
      SELECT * FROM meter_events 
      ${whereClause}
      ORDER BY timestamp DESC 
      LIMIT $${paramIndex}
    `;
    params.push(limit);

    const result = await this.db.query(query, params);

    return result.rows.map((row) => ({
      agent_id: row.agent_id,
      resource_url: row.resource_url,
      event_type: row.event_type,
      metadata: row.metadata,
      timestamp: row.timestamp,
    }));
  }
}

