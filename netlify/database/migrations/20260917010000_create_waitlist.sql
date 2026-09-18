-- Early-access signups from the login page. Emails are stored lowercase and
-- counted to show the remaining spots. Idempotent.
CREATE TABLE IF NOT EXISTS waitlist (
  email TEXT PRIMARY KEY CHECK (char_length(email) BETWEEN 3 AND 254 AND email = lower(email)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS waitlist_created ON waitlist(created_at);
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
