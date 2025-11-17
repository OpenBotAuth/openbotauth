-- OpenBotAuth MCP Server Tables

-- Policy logs
CREATE TABLE IF NOT EXISTS policy_logs (
  id SERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL,
  resource_url TEXT NOT NULL,
  effect TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policy_logs_agent ON policy_logs(agent_id);
CREATE INDEX IF NOT EXISTS idx_policy_logs_resource ON policy_logs(resource_url);
CREATE INDEX IF NOT EXISTS idx_policy_logs_created_at ON policy_logs(created_at);

-- Payment intents
CREATE TABLE IF NOT EXISTS payment_intents (
  id UUID PRIMARY KEY,
  agent_id TEXT NOT NULL,
  resource_url TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  status TEXT NOT NULL,
  pay_url TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  paid_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_agent ON payment_intents(agent_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_status ON payment_intents(status);
CREATE INDEX IF NOT EXISTS idx_payment_intents_created_at ON payment_intents(created_at);

-- Meter events
CREATE TABLE IF NOT EXISTS meter_events (
  id SERIAL PRIMARY KEY,
  agent_id TEXT NOT NULL,
  resource_url TEXT NOT NULL,
  event_type TEXT NOT NULL,
  metadata JSONB,
  timestamp TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_meter_events_agent ON meter_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_meter_events_resource ON meter_events(resource_url);
CREATE INDEX IF NOT EXISTS idx_meter_events_type ON meter_events(event_type);
CREATE INDEX IF NOT EXISTS idx_meter_events_timestamp ON meter_events(timestamp);

-- Resource policies (optional - for storing policies in DB)
CREATE TABLE IF NOT EXISTS resource_policies (
  id SERIAL PRIMARY KEY,
  resource_url TEXT UNIQUE NOT NULL,
  policy JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resource_policies_url ON resource_policies(resource_url);

-- Comments
COMMENT ON TABLE policy_logs IS 'Logs of policy evaluation results';
COMMENT ON TABLE payment_intents IS 'Payment intents for paid content access';
COMMENT ON TABLE meter_events IS 'Usage events for metering and analytics';
COMMENT ON TABLE resource_policies IS 'Resource-specific access policies';

