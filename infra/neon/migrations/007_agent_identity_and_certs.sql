-- Add optional OpenBotAuth agent identity fields
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS oba_agent_id TEXT,
  ADD COLUMN IF NOT EXISTS oba_parent_agent_id TEXT,
  ADD COLUMN IF NOT EXISTS oba_principal TEXT;

-- Store issued X.509 certificates for agent keys
CREATE TABLE IF NOT EXISTS public.agent_certificates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  kid TEXT NOT NULL,
  serial TEXT NOT NULL UNIQUE,
  cert_pem TEXT NOT NULL,
  chain_pem TEXT NOT NULL,
  x5c TEXT[] NOT NULL,
  not_before TIMESTAMP WITH TIME ZONE NOT NULL,
  not_after TIMESTAMP WITH TIME ZONE NOT NULL,
  fingerprint_sha256 TEXT NOT NULL,
  revoked_at TIMESTAMP WITH TIME ZONE,
  revoked_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_certs_agent_id ON public.agent_certificates(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_certs_kid ON public.agent_certificates(kid);
CREATE INDEX IF NOT EXISTS idx_agent_certs_revoked ON public.agent_certificates(revoked_at);
