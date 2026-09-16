-- One-time initial owner for crops-superfun; no plaintext credential is stored here.
-- The password is rotated through the authenticated API immediately after deploy.
-- Existing Crops installations are preserved. A later retirement migration removes
-- this unused seed from future fresh installs; keep both migrations in history.
DO $crops_bootstrap$
BEGIN
  PERFORM id FROM app_locks WHERE id=1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Crops schema is not initialized'; END IF;
  IF EXISTS (SELECT 1 FROM users) THEN RETURN; END IF;
  INSERT INTO users(id,username,name,password_hash) VALUES('010b2f81-3265-4ebc-af1b-fb8263ab8c2b','clark','Clark Wimberly','scrypt:32768:8:3:5c99d5f2b023c22b5bc70d9a561d864d:6abde64d7b84caaec6d177ee1c344f646662366573bc5dc3ee5598f31698863cf2844dbcd3157136009bd03c0da8e743789d2d206072110440a19a3a838aa30c');
  INSERT INTO teams(id,name) VALUES('5954ddf5-d07c-4cdd-bb21-932d0f6c7208','Superfun Games LLC');
  INSERT INTO memberships(id,team_id,user_id,role) VALUES('677ad3a7-22a4-48c9-8bed-f023ccd88fa1','5954ddf5-d07c-4cdd-bb21-932d0f6c7208','010b2f81-3265-4ebc-af1b-fb8263ab8c2b','admin');
  INSERT INTO clients(id,team_id,name) VALUES('159422bf-5832-4aea-b80c-13b2bf4e3072','5954ddf5-d07c-4cdd-bb21-932d0f6c7208','Internal');
  INSERT INTO projects(id,team_id,client_id,name,billable) VALUES('31c09eab-fdab-4776-ad89-cdc67b755e14','5954ddf5-d07c-4cdd-bb21-932d0f6c7208','159422bf-5832-4aea-b80c-13b2bf4e3072','General',false);
END
$crops_bootstrap$;
