-- Speed up certificate status lookups by fingerprint
CREATE INDEX IF NOT EXISTS idx_agent_certs_fingerprint_sha256
  ON public.agent_certificates(fingerprint_sha256);
