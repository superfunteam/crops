-- Team membership controls current access, not ownership of historical time.
-- Keep the existing user, team, and project foreign keys and all recorded time.
ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_team_id_user_id_fkey;
