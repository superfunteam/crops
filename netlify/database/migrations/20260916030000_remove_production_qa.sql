-- Remove only the isolated production QA workspace and its three test accounts.
-- Exact IDs prevent affecting the owner's real workspace, sessions, or time.
DO $crops_cleanup_qa$
BEGIN
  PERFORM id FROM app_locks WHERE id=1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Crops schema is not initialized'; END IF;
  PERFORM id FROM teams WHERE id='b4bbd37a-dbe1-48c0-8850-b6b723f2e0ee' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  PERFORM id FROM users WHERE id IN ('010b2f81-3265-4ebc-af1b-fb8263ab8c2b','61a21f6d-d432-45a1-b537-e7c38a6dfabb','a119765b-28be-43bf-88a5-a6df3f268f2a','f7d15de6-8ce7-4b28-85ae-dbf2f58d49eb') ORDER BY id FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM memberships WHERE team_id='b4bbd37a-dbe1-48c0-8850-b6b723f2e0ee' AND user_id='010b2f81-3265-4ebc-af1b-fb8263ab8c2b' AND role='admin') THEN
    RAISE EXCEPTION 'QA cleanup refused: expected workspace owner is missing';
  END IF;
  IF EXISTS (SELECT 1 FROM memberships WHERE team_id='b4bbd37a-dbe1-48c0-8850-b6b723f2e0ee' AND user_id NOT IN ('010b2f81-3265-4ebc-af1b-fb8263ab8c2b','61a21f6d-d432-45a1-b537-e7c38a6dfabb','a119765b-28be-43bf-88a5-a6df3f268f2a','f7d15de6-8ce7-4b28-85ae-dbf2f58d49eb')) THEN
    RAISE EXCEPTION 'QA cleanup refused: workspace contains an unexpected member';
  END IF;
  IF EXISTS (SELECT 1 FROM memberships WHERE user_id IN ('61a21f6d-d432-45a1-b537-e7c38a6dfabb','a119765b-28be-43bf-88a5-a6df3f268f2a','f7d15de6-8ce7-4b28-85ae-dbf2f58d49eb') AND team_id<>'b4bbd37a-dbe1-48c0-8850-b6b723f2e0ee') THEN
    RAISE EXCEPTION 'QA cleanup refused: a test account belongs to another workspace';
  END IF;
  DELETE FROM entries WHERE team_id='b4bbd37a-dbe1-48c0-8850-b6b723f2e0ee';
  DELETE FROM sessions WHERE user_id IN ('61a21f6d-d432-45a1-b537-e7c38a6dfabb','a119765b-28be-43bf-88a5-a6df3f268f2a','f7d15de6-8ce7-4b28-85ae-dbf2f58d49eb');
  DELETE FROM mutation_requests WHERE user_id IN ('61a21f6d-d432-45a1-b537-e7c38a6dfabb','a119765b-28be-43bf-88a5-a6df3f268f2a','f7d15de6-8ce7-4b28-85ae-dbf2f58d49eb');
  DELETE FROM projects WHERE team_id='b4bbd37a-dbe1-48c0-8850-b6b723f2e0ee';
  DELETE FROM clients WHERE team_id='b4bbd37a-dbe1-48c0-8850-b6b723f2e0ee';
  DELETE FROM memberships WHERE team_id='b4bbd37a-dbe1-48c0-8850-b6b723f2e0ee';
  DELETE FROM teams WHERE id='b4bbd37a-dbe1-48c0-8850-b6b723f2e0ee';
  DELETE FROM users WHERE id IN ('61a21f6d-d432-45a1-b537-e7c38a6dfabb','a119765b-28be-43bf-88a5-a6df3f268f2a','f7d15de6-8ce7-4b28-85ae-dbf2f58d49eb');
END
$crops_cleanup_qa$;
