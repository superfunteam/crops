// Shared PostgreSQL schema, bundled with the API for Netlify and PGlite.
export const schema = `
CREATE TABLE IF NOT EXISTS app_locks (id INTEGER PRIMARY KEY);
INSERT INTO app_locks(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams(id),
  user_id TEXT NOT NULL REFERENCES users(id), role TEXT NOT NULL CHECK (role IN ('admin','member')),
  UNIQUE(team_id,user_id)
);
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams(id), name TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '', archived BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(id,team_id)
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams(id), client_id TEXT,
  name TEXT NOT NULL, code TEXT NOT NULL DEFAULT '', color TEXT NOT NULL DEFAULT '#C56845',
  billable BOOLEAN NOT NULL DEFAULT true, rate NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (rate >= 0),
  budget_hours NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (budget_hours >= 0),
  archived BOOLEAN NOT NULL DEFAULT false, UNIQUE(id,team_id),
  FOREIGN KEY(client_id,team_id) REFERENCES clients(id,team_id)
);
CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams(id),
  user_id TEXT NOT NULL REFERENCES users(id), project_id TEXT NOT NULL,
  task TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', date DATE NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0 CHECK (duration_seconds >= 0),
  started_at TIMESTAMPTZ, billable BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'unbilled' CHECK (status IN ('unbilled','invoiced','paid')),
  version INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(project_id,team_id) REFERENCES projects(id,team_id),
  CHECK (started_at IS NULL OR status = 'unbilled')
);
CREATE UNIQUE INDEX IF NOT EXISTS entries_one_running_user ON entries(user_id) WHERE started_at IS NOT NULL;
-- Historical time survives revoking membership; user/team/project FKs remain.
ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_team_id_user_id_fkey;
-- Agent-reported usage (tokens and USD cost) billed on top of hours × rate.
ALTER TABLE entries ADD COLUMN IF NOT EXISTS agent_tokens BIGINT CHECK (agent_tokens >= 0);
ALTER TABLE entries ADD COLUMN IF NOT EXISTS agent_cost NUMERIC(12,2) CHECK (agent_cost >= 0);
ALTER TABLE entries ADD COLUMN IF NOT EXISTS agent_model TEXT CHECK (char_length(agent_model) BETWEEN 1 AND 100);
DO $crops_agent_usage$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='entries_agent_complete' AND conrelid='entries'::regclass) THEN
    ALTER TABLE entries ADD CONSTRAINT entries_agent_complete CHECK ((agent_tokens IS NULL) = (agent_cost IS NULL) AND (agent_model IS NULL OR agent_tokens IS NOT NULL));
  END IF;
END
$crops_agent_usage$;
CREATE INDEX IF NOT EXISTS entries_team_date ON entries(team_id,date DESC);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS auth_limits (
  key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_limits_expiry ON auth_limits(reset_at);
CREATE TABLE IF NOT EXISTS mutation_requests (
  user_id TEXT NOT NULL REFERENCES users(id), request_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL, response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(user_id,request_key)
);
CREATE INDEX IF NOT EXISTS mutation_requests_expiry ON mutation_requests(created_at);
-- Personal access keys for the API, MCP server, and webhooks (SHA-256 hashes only).
CREATE TABLE IF NOT EXISTS access_keys (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  prefix TEXT NOT NULL CHECK (char_length(prefix) BETWEEN 1 AND 20),
  key_hash TEXT NOT NULL CHECK (key_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), last_used_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS access_keys_hash ON access_keys(key_hash);
CREATE INDEX IF NOT EXISTS access_keys_user ON access_keys(user_id);
-- Early-access signups from the login page (lowercase emails).
CREATE TABLE IF NOT EXISTS waitlist (
  email TEXT PRIMARY KEY CHECK (char_length(email) BETWEEN 3 AND 254 AND email = lower(email)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS waitlist_created ON waitlist(created_at);

-- Hosted PostgreSQL services may expose public-schema tables through a REST API.
-- No direct client policies are granted. The Crops SQL table owner bypasses RLS
-- and applies the team/role checks in server/api.mjs.
ALTER TABLE app_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE mutation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
`;
