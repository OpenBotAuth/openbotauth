-- OpenBotAuth Radar Telemetry
-- Migration 004: Create signed_attempt_logs table for all signed requests (verified + failed)
-- Separate from verification_logs to preserve karma/per-user stats integrity

-- All signed requests (verified + failed) - separate from verification_logs
-- Keeps karma/per-user stats intact in verification_logs
CREATE TABLE IF NOT EXISTS public.signed_attempt_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signature_agent TEXT,           -- Claimed Signature-Agent header
  target_origin TEXT NOT NULL,    -- Origin only (scheme+host)
  method TEXT NOT NULL,
  verified BOOLEAN NOT NULL,
  failure_reason TEXT,            -- NULL if verified, else: missing_headers, bad_signature, etc.
  username TEXT,                  -- Extracted if parseable, NULL otherwise
  jwks_url TEXT,                  -- Same as signature_agent if parseable
  client_name TEXT,               -- From agent result if verified
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_signed_logs_timestamp ON public.signed_attempt_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_signed_logs_verified ON public.signed_attempt_logs(verified);
CREATE INDEX IF NOT EXISTS idx_signed_logs_date ON public.signed_attempt_logs(DATE(timestamp));
CREATE INDEX IF NOT EXISTS idx_signed_logs_origin ON public.signed_attempt_logs(target_origin);
CREATE INDEX IF NOT EXISTS idx_signed_logs_username ON public.signed_attempt_logs(username) WHERE username IS NOT NULL;

