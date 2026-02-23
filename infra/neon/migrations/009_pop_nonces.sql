-- PoP nonce tracking for replay prevention
-- Nonces are stored for 5 minutes to match the PoP timestamp window

CREATE TABLE IF NOT EXISTS pop_nonces (
  hash TEXT PRIMARY KEY,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_pop_nonces_expires_at ON pop_nonces (expires_at);

-- Function to check and store a nonce atomically (returns true if nonce is new)
CREATE OR REPLACE FUNCTION check_pop_nonce(nonce_hash TEXT, ttl_seconds INT DEFAULT 300)
RETURNS BOOLEAN AS $$
DECLARE
  inserted BOOLEAN;
BEGIN
  -- Clean up expired nonces (limit to avoid long locks)
  DELETE FROM pop_nonces WHERE expires_at < now() AND ctid IN (
    SELECT ctid FROM pop_nonces WHERE expires_at < now() LIMIT 100
  );

  -- Try to insert the nonce
  INSERT INTO pop_nonces (hash, expires_at)
  VALUES (nonce_hash, now() + (ttl_seconds || ' seconds')::INTERVAL)
  ON CONFLICT (hash) DO NOTHING;

  -- Check if we inserted (FOUND is true if INSERT affected a row)
  GET DIAGNOSTICS inserted = ROW_COUNT;

  RETURN inserted > 0;
END;
$$ LANGUAGE plpgsql;
