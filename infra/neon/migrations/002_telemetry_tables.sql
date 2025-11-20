-- Telemetry and Karma System
-- Migration 002: Create telemetry tables for tracking verification activity

-- Verification logs from verifier service
CREATE TABLE IF NOT EXISTS public.verification_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jwks_url TEXT NOT NULL,
  username TEXT NOT NULL,
  target_origin TEXT NOT NULL,
  method TEXT NOT NULL,
  verified BOOLEAN NOT NULL,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_verification_logs_username ON public.verification_logs(username);
CREATE INDEX IF NOT EXISTS idx_verification_logs_timestamp ON public.verification_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_verification_logs_origin ON public.verification_logs(target_origin);

-- User karma/telemetry stats (aggregated periodically from Redis)
CREATE TABLE IF NOT EXISTS public.user_stats (
  username TEXT PRIMARY KEY,
  last_seen TIMESTAMP WITH TIME ZONE,
  total_requests BIGINT DEFAULT 0,
  unique_origins_count INTEGER DEFAULT 0,
  karma_score INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_user_stats_karma ON public.user_stats(karma_score DESC);

