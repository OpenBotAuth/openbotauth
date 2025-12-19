import type { RedisClientType } from 'redis';
import { Pool } from 'pg';

export class TelemetryLogger {
  constructor(
    private redis: RedisClientType<any>,
    private db: Pool
  ) {}

  async logVerification(data: {
    username: string;
    jwksUrl: string;
    targetOrigin: string;
    method: string;
    verified: boolean;
  }): Promise<void> {
    try {
      // Update Redis counters (real-time)
      await Promise.all([
        this.redis.incr(`stats:${data.username}:requests`),
        this.redis.sAdd(`stats:${data.username}:origins`, data.targetOrigin),
        this.redis.set(`stats:${data.username}:last_seen`, Date.now().toString()),
      ]);

      // Log to database (async, non-blocking)
      setImmediate(async () => {
        try {
          await this.db.query(
            `INSERT INTO verification_logs (jwks_url, username, target_origin, method, verified)
             VALUES ($1, $2, $3, $4, $5)`,
            [data.jwksUrl, data.username, data.targetOrigin, data.method, data.verified]
          );
        } catch (err) {
          console.error('Database telemetry error:', err);
        }
      });
    } catch (err) {
      console.error('Telemetry logging error:', err);
    }
  }

  /**
   * Log a signed attempt (both verified and failed) for Radar analytics
   * This is separate from logVerification() to preserve karma stats
   */
  async logSignedAttempt(data: {
    signatureAgent: string | null;
    targetOrigin: string;
    method: string;
    verified: boolean;
    failureReason: string | null;
    username: string | null;
    jwksUrl: string | null;
    clientName: string | null;
  }): Promise<void> {
    try {
      // 1. Update global Redis counters (for Radar overview/timeseries)
      const dateKey = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      await Promise.all([
        this.redis.incr(`stats:global:signed:${dateKey}`),
        data.verified 
          ? this.redis.incr(`stats:global:verified:${dateKey}`)
          : this.redis.incr(`stats:global:failed:${dateKey}`),
      ]);
      
      // 2. Insert to signed_attempt_logs (async, with error handling)
      setImmediate(async () => {
        try {
          await this.db.query(
            `INSERT INTO signed_attempt_logs 
             (signature_agent, target_origin, method, verified, failure_reason, username, jwks_url, client_name)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [data.signatureAgent, data.targetOrigin, data.method, data.verified, 
             data.failureReason, data.username, data.jwksUrl, data.clientName]
          );
        } catch (err) {
          console.error('Signed attempt DB insert error:', err);
        }
      });
    } catch (err) {
      console.error('Signed attempt Redis error:', err);
    }
  }

  async getUserStats(username: string): Promise<{
    last_seen: number | null;
    request_volume: number;
    site_diversity: number;
    karma_score: number;
  }> {
    try {
      const [lastSeen, requests, origins] = await Promise.all([
        this.redis.get(`stats:${username}:last_seen`),
        this.redis.get(`stats:${username}:requests`),
        this.redis.sCard(`stats:${username}:origins`),
      ]);

      const requestVolume = parseInt(requests || '0', 10);
      const siteDiversity = origins || 0;
      
      // Calculate karma score
      const baseScore = Math.floor(requestVolume / 100);
      const diversityBonus = siteDiversity * 10;
      const karmaScore = baseScore + diversityBonus;

      return {
        last_seen: lastSeen ? parseInt(lastSeen, 10) : null,
        request_volume: requestVolume,
        site_diversity: siteDiversity,
        karma_score: karmaScore,
      };
    } catch (err) {
      console.error('Error fetching user stats:', err);
      return {
        last_seen: null,
        request_volume: 0,
        site_diversity: 0,
        karma_score: 0,
      };
    }
  }
}

