CREATE TABLE IF NOT EXISTS ai_request_limits (
  scope_key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scope_key, window_start)
);

CREATE INDEX IF NOT EXISTS ai_request_limits_updated_idx
  ON ai_request_limits (updated_at);
