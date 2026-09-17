-- Agent-reported usage on time entries. Agents submit their own token counts and
-- USD cost; billable entries bill that cost on top of hours × rate. Idempotent.
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
