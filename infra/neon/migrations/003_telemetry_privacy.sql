-- Add privacy setting to user_stats
-- Migration 003: Add is_public column for telemetry visibility control

ALTER TABLE public.user_stats 
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true NOT NULL;

COMMENT ON COLUMN public.user_stats.is_public IS 'Whether telemetry stats are publicly visible (default: true)';

