/**
 * MCP Server Types
 */

export interface PolicyRule {
  effect: 'allow' | 'deny' | 'teaser' | 'pay';
  teaser_words?: number;
  price_cents?: number;
  currency?: string;
  whitelist?: string[];
  blacklist?: string[];
  rate_limit?: {
    max_requests: number;
    window_seconds: number;
  };
}

export interface PolicyRequest {
  agent_id: string;
  resource_url: string;
  resource_type?: string;
  context?: Record<string, any>;
}

export interface PolicyResult {
  effect: 'allow' | 'deny' | 'teaser' | 'pay' | 'rate_limit';
  reason?: string;
  teaser_words?: number;
  price_cents?: number;
  currency?: string;
  pay_url?: string;
  retry_after?: number;
}

export interface PaymentIntent {
  id: string;
  agent_id: string;
  resource_url: string;
  amount_cents: number;
  currency: string;
  status: 'pending' | 'paid' | 'failed' | 'expired';
  pay_url: string;
  created_at: string;
  expires_at: string;
}

export interface MeterEvent {
  agent_id: string;
  resource_url: string;
  event_type: 'access' | 'payment' | 'denial' | 'rate_limit';
  metadata?: Record<string, any>;
  timestamp: string;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}

export interface RedisConfig {
  url: string;
}

