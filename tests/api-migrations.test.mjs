import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const migration = (name) => readFile(new URL(`../netlify/database/migrations/${name}.sql`, import.meta.url), 'utf8');
const schema = await migration('20260915210000_create_crops');
const bootstrap = await migration('20260916010000_bootstrap_initial_owner');
const retirement = await migration('20260916020000_retire_bootstrap_credential');

async function fixture(run) {
  const db = new PGlite('memory://');
  try { await db.exec(schema); await run(db); }
  finally { await db.close(); }
}

test('deployment bootstrap creates one owner without a session and preserves changed credentials on replay', async () => {
  await fixture(async (db) => {
    await db.exec(bootstrap);
    const owner = (await db.query('SELECT id,username,password_hash FROM users')).rows;
    assert.equal(owner.length, 1);
    assert.equal(owner[0].username, 'clark');
    assert.match(owner[0].password_hash, /^scrypt:32768:8:3:[a-f0-9]{32}:[a-f0-9]{128}$/);
    assert.equal((await db.query('SELECT role FROM memberships')).rows[0].role, 'admin');
    assert.equal((await db.query('SELECT billable FROM projects')).rows[0].billable, false);
    assert.equal((await db.query('SELECT id FROM clients')).rows.length, 1);
    assert.equal((await db.query('SELECT token_hash FROM sessions')).rows.length, 0);
    await db.query('UPDATE users SET password_hash=$1 WHERE id=$2', ['rotated-test-hash', owner[0].id]);
    await db.exec(bootstrap);
    assert.deepEqual((await db.query('SELECT password_hash FROM users')).rows, [{ password_hash: 'rotated-test-hash' }]);
    assert.equal((await db.query('SELECT id FROM teams')).rows.length, 1);
  });
});

test('deployment bootstrap leaves an existing Crops installation unchanged', async () => {
  await fixture(async (db) => {
    await db.query("INSERT INTO users(id,username,name,password_hash) VALUES('existing','existing','Existing owner','existing-test-hash')");
    await db.exec(bootstrap);
    assert.deepEqual((await db.query('SELECT id,password_hash FROM users')).rows, [{ id: 'existing', password_hash: 'existing-test-hash' }]);
    for (const table of ['teams', 'memberships', 'clients', 'projects', 'sessions']) {
      assert.equal((await db.query(`SELECT * FROM ${table}`)).rows.length, 0);
    }
  });
});

test('fresh installs retire every deployment seed and can use normal owner setup', async () => {
  await fixture(async (db) => {
    await db.exec(bootstrap);
    await db.exec(retirement);
    await db.exec(retirement);
    for (const table of ['users', 'teams', 'memberships', 'clients', 'projects', 'sessions']) {
      assert.equal((await db.query(`SELECT * FROM ${table}`)).rows.length, 0);
    }
    assert.equal((await db.query('SELECT id FROM app_locks')).rows.length, 1);
  });
});

test('bootstrap retirement preserves the live owner after password rotation', async () => {
  await fixture(async (db) => {
    await db.exec(bootstrap);
    await db.query("UPDATE users SET password_hash='rotated-test-hash'");
    const owner = (await db.query('SELECT id FROM users')).rows[0];
    await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES('current-session',$1,now()+INTERVAL '1 day')", [owner.id]);
    await db.exec(retirement);
    assert.deepEqual((await db.query('SELECT password_hash FROM users')).rows, [{ password_hash: 'rotated-test-hash' }]);
    for (const table of ['teams', 'memberships', 'clients', 'projects', 'sessions']) {
      assert.equal((await db.query(`SELECT * FROM ${table}`)).rows.length, 1);
    }
  });
});

test('bootstrap retirement refuses an unrotated account that has already been used', async () => {
  await fixture(async (db) => {
    await db.exec(bootstrap);
    const owner = (await db.query('SELECT id FROM users')).rows[0];
    await db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES('unrotated-session',$1,now()+INTERVAL '1 day')", [owner.id]);
    await assert.rejects(db.exec(retirement), /Rotate the initial owner password/);
    assert.equal((await db.query('SELECT id FROM users')).rows.length, 1);
    assert.equal((await db.query('SELECT id FROM teams')).rows.length, 1);
    assert.equal((await db.query('SELECT token_hash FROM sessions')).rows.length, 1);
  });
});

test('member removal migration preserves historical entries and their remaining foreign keys', async () => {
  await fixture(async db => {
    await db.exec(bootstrap);
    const member = (await db.query('SELECT * FROM memberships')).rows[0];
    const project = (await db.query('SELECT id FROM projects')).rows[0];
    await db.query("INSERT INTO entries(id,team_id,user_id,project_id,date,duration_seconds) VALUES('history',$1,$2,$3,'2026-09-16',3600)", [member.team_id, member.user_id, project.id]);
    await assert.rejects(db.query('DELETE FROM memberships WHERE id=$1', [member.id]));
    const removal = await migration('20260916190000_preserve_former_member_time');
    await db.exec(removal);
    await db.exec(removal);
    await db.query('DELETE FROM memberships WHERE id=$1', [member.id]);
    assert.equal((await db.query("SELECT duration_seconds FROM entries WHERE id='history'")).rows[0].duration_seconds, 3600);
    await assert.rejects(db.query('DELETE FROM users WHERE id=$1', [member.user_id]));
    await assert.rejects(db.query('DELETE FROM projects WHERE id=$1', [project.id]));
  });
});

test('agent usage migration adds validated nullable columns and matches the dev schema on replay', async () => {
  await fixture(async db => {
    await db.exec(bootstrap);
    const member = (await db.query('SELECT * FROM memberships')).rows[0];
    const project = (await db.query('SELECT id FROM projects')).rows[0];
    await db.query("INSERT INTO entries(id,team_id,user_id,project_id,date,duration_seconds) VALUES('before',$1,$2,$3,'2026-09-16',60)", [member.team_id, member.user_id, project.id]);
    const usage = await migration('20260916210000_add_agent_usage');
    await db.exec(usage);
    await db.exec(usage);
    const { schema: devSchema } = await import('../db/schema.mjs');
    await db.exec(devSchema);
    assert.deepEqual((await db.query("SELECT agent_tokens,agent_cost,agent_model FROM entries WHERE id='before'")).rows, [{ agent_tokens: null, agent_cost: null, agent_model: null }]);
    await db.query("UPDATE entries SET agent_tokens=2410000,agent_cost=31.40,agent_model='claude-opus-5' WHERE id='before'");
    const row = (await db.query("SELECT agent_tokens,agent_cost FROM entries WHERE id='before'")).rows[0];
    assert.equal(Number(row.agent_tokens), 2410000);
    assert.equal(Number(row.agent_cost), 31.4);
    for (const invalid of ['agent_tokens=-1', 'agent_cost=-1', 'agent_tokens=NULL', 'agent_cost=NULL', "agent_model=''"]) {
      await assert.rejects(db.query(`UPDATE entries SET ${invalid} WHERE id='before'`), undefined, invalid);
    }
    await db.query("UPDATE entries SET agent_tokens=NULL,agent_cost=NULL,agent_model=NULL WHERE id='before'");
    assert.equal((await db.query("SELECT COUNT(*)::integer AS count FROM pg_constraint WHERE conname='entries_agent_complete'")).rows[0].count, 1);
  });
});

test('access key migration stores only validated hashes, cascades with users, and matches the dev schema on replay', async () => {
  await fixture(async db => {
    await db.exec(bootstrap);
    const keys = await migration('20260916220000_add_access_keys');
    await db.exec(keys);
    await db.exec(keys);
    const { schema: devSchema } = await import('../db/schema.mjs');
    await db.exec(devSchema);
    const user = (await db.query('SELECT id FROM users')).rows[0];
    const hash = 'a'.repeat(64);
    await db.query("INSERT INTO access_keys(id,user_id,name,prefix,key_hash) VALUES('key',$1,'Zapier','crops_abcdef',$2)", [user.id, hash]);
    await assert.rejects(db.query("INSERT INTO access_keys(id,user_id,name,prefix,key_hash) VALUES('dup',$1,'Again','crops_abcdef',$2)", [user.id, hash]));
    for (const [name, keyHash] of [['', 'b'.repeat(64)], ['x'.repeat(101), 'c'.repeat(64)], ['Plain', 'crops_not-a-hash']]) {
      await assert.rejects(db.query("INSERT INTO access_keys(id,user_id,name,prefix,key_hash) VALUES($1,$2,$3,'crops_abcdef',$4)", [`bad-${keyHash}`, user.id, name, keyHash]));
    }
    const row = (await db.query("SELECT last_used_at,revoked_at,created_at FROM access_keys WHERE id='key'")).rows[0];
    assert.equal(row.last_used_at, null);
    assert.equal(row.revoked_at, null);
    assert.ok(row.created_at);
    assert.equal((await db.query("SELECT COUNT(*)::integer AS count FROM pg_indexes WHERE indexname='access_keys_hash'")).rows[0].count, 1);
    assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE relname='access_keys'")).rows[0].relrowsecurity, true);
    await db.exec('DELETE FROM mutation_requests; DELETE FROM entries; DELETE FROM projects; DELETE FROM clients; DELETE FROM memberships; DELETE FROM teams; DELETE FROM sessions');
    await db.query('DELETE FROM users WHERE id=$1', [user.id]);
    assert.equal((await db.query('SELECT id FROM access_keys')).rows.length, 0);
  });
});

test('waitlist migration stores unique lowercase emails and matches the dev schema on replay', async () => {
  await fixture(async db => {
    await db.exec(bootstrap);
    const waitlist = await migration('20260917010000_create_waitlist');
    await db.exec(waitlist);
    await db.exec(waitlist);
    const { schema: devSchema } = await import('../db/schema.mjs');
    await db.exec(devSchema);
    await db.query("INSERT INTO waitlist(email) VALUES('ada@example.com')");
    await assert.rejects(db.query("INSERT INTO waitlist(email) VALUES('ada@example.com')"));
    await assert.rejects(db.query("INSERT INTO waitlist(email) VALUES('Ada@Example.com')"));
    assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE relname='waitlist'")).rows[0].relrowsecurity, true);
  });
});
