-- Retire the deployment-only bootstrap credential for future fresh installs.
-- The live owner rotated their password before this migration was published, so
-- the exact-hash predicate preserves that owner, their team, and all their data.
-- Fresh installs apply both migrations and end with no accounts; operators use
-- the normal secure first-owner setup. No temporary credential remains usable.
DO $crops_retire_bootstrap$
BEGIN
  PERFORM id FROM app_locks WHERE id=1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Crops schema is not initialized'; END IF;
  PERFORM id FROM users WHERE id='010b2f81-3265-4ebc-af1b-fb8263ab8c2b' AND password_hash='scrypt:32768:8:3:5c99d5f2b023c22b5bc70d9a561d864d:6abde64d7b84caaec6d177ee1c344f646662366573bc5dc3ee5598f31698863cf2844dbcd3157136009bd03c0da8e743789d2d206072110440a19a3a838aa30c' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM sessions WHERE user_id='010b2f81-3265-4ebc-af1b-fb8263ab8c2b')
     OR EXISTS (SELECT 1 FROM entries WHERE user_id='010b2f81-3265-4ebc-af1b-fb8263ab8c2b' OR team_id='5954ddf5-d07c-4cdd-bb21-932d0f6c7208')
     OR EXISTS (SELECT 1 FROM mutation_requests WHERE user_id='010b2f81-3265-4ebc-af1b-fb8263ab8c2b') THEN
    RAISE EXCEPTION 'Rotate the initial owner password before retiring bootstrap credentials';
  END IF;
  DELETE FROM projects WHERE id='31c09eab-fdab-4776-ad89-cdc67b755e14' AND team_id='5954ddf5-d07c-4cdd-bb21-932d0f6c7208';
  DELETE FROM clients WHERE id='159422bf-5832-4aea-b80c-13b2bf4e3072' AND team_id='5954ddf5-d07c-4cdd-bb21-932d0f6c7208';
  DELETE FROM memberships WHERE id='677ad3a7-22a4-48c9-8bed-f023ccd88fa1' AND team_id='5954ddf5-d07c-4cdd-bb21-932d0f6c7208' AND user_id='010b2f81-3265-4ebc-af1b-fb8263ab8c2b';
  DELETE FROM teams WHERE id='5954ddf5-d07c-4cdd-bb21-932d0f6c7208';
  DELETE FROM users WHERE id='010b2f81-3265-4ebc-af1b-fb8263ab8c2b' AND password_hash='scrypt:32768:8:3:5c99d5f2b023c22b5bc70d9a561d864d:6abde64d7b84caaec6d177ee1c344f646662366573bc5dc3ee5598f31698863cf2844dbcd3157136009bd03c0da8e743789d2d206072110440a19a3a838aa30c';
END
$crops_retire_bootstrap$;
