-- Personal access keys for the API, MCP server, and webhooks. Only the SHA-256
-- hash of each secret is stored; revoked keys stay for auditing. Idempotent.
CREATE TABLE IF NOT EXISTS access_keys (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  prefix TEXT NOT NULL CHECK (char_length(prefix) BETWEEN 1 AND 20),
  key_hash TEXT NOT NULL CHECK (key_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_used_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS access_keys_hash ON access_keys(key_hash);
CREATE INDEX IF NOT EXISTS access_keys_user ON access_keys(user_id);
ALTER TABLE access_keys ENABLE ROW LEVEL SECURITY;
