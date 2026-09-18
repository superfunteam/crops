import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { createDatabase } from '../server/db.mjs';
import { createApi } from '../server/api.mjs';

// Opt-in integration against a real PostgreSQL connection. Each run uses and
// removes its own random schema; the database user must have CREATE privilege.
test('PostgreSQL cold starts and mutations coordinate across separate connection pools', { skip: !process.env.CROPS_TEST_DATABASE_URL }, async () => {
  const connectionString = process.env.CROPS_TEST_DATABASE_URL;
  const schema = `crops_test_${randomUUID().replaceAll('-', '')}`;
  const nativeSchema = `${schema}_native`;
  const control = new pg.Pool({ connectionString, max: 1 });
  const databases = [];
  let readerRole;
  const env = { NODE_ENV: 'test', CROPS_ALLOW_REGISTRATION: 'false' };
  async function call(api, path, body, token, key, method = 'POST') {
    const response = await api(new Request(`http://localhost:8787/api${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), { ip: 'postgres-integration' });
    return { status: response.status, body: await response.json() };
  }
  try {
    await control.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(connectionString);
    url.searchParams.set('options', `-c search_path=${schema}`);
    databases.push(...await Promise.all(Array.from({ length: 4 }, () => createDatabase({ url: url.toString(), env }))));
    const secured = await control.query('SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind=$2', [schema, 'r']);
    assert.equal(secured.rows.length, 10);
    assert.ok(secured.rows.every((table) => table.relrowsecurity), 'Every application table must have RLS enabled.');
    await control.query(`CREATE SCHEMA ${nativeSchema}`);
    const nativeUrl = new URL(connectionString);
    nativeUrl.searchParams.set('options', `-c search_path=${nativeSchema}`);
    const nativeEnv = { NODE_ENV: 'production', NETLIFY_DB_URL: nativeUrl.toString(), CROPS_ALLOW_REGISTRATION: 'false' };
    await assert.rejects(createDatabase({ env: nativeEnv }), (error) => error.code === 'schema_uninitialized');
    assert.equal((await control.query('SELECT COUNT(*)::integer AS count FROM pg_tables WHERE schemaname=$1', [nativeSchema])).rows[0].count, 0, 'Native mode must never create schema during a request.');
    const migrationConnection = await control.connect();
    try {
      await migrationConnection.query('BEGIN');
      await migrationConnection.query(`SET LOCAL search_path=${nativeSchema}`);
      const migration = await readFile(new URL('../netlify/database/migrations/20260915210000_create_crops.sql', import.meta.url), 'utf8');
      await migrationConnection.query(migration);
      await migrationConnection.query('COMMIT');
    } finally { migrationConnection.release(); }
    const nativeDb = await createDatabase({ env: nativeEnv });
    databases.push(nativeDb);
    assert.equal(nativeDb.kind, 'netlify-postgres');
    const nativeSetup = createApi({ db: nativeDb, env: nativeEnv, bootstrapOnly: true });
    const nativeHealth = await call(nativeSetup, '/health', undefined, undefined, undefined, 'GET');
    assert.equal(nativeHealth.body.storage, 'netlify-postgres');
    assert.equal(nativeHealth.body.registrationEnabled, false);
    const nativeOwner = await call(nativeSetup, '/auth/register', { username: 'nativeowner', name: 'Native Owner', teamName: 'Native studio', password: 'native-password' });
    assert.equal(nativeOwner.status, 201);
    assert.equal((await nativeDb.query('SELECT COUNT(*)::integer AS count FROM sessions')).rows[0].count, 0);
    const publicApi = createApi({ db: databases[0], env });
    assert.equal((await call(publicApi, '/auth/register', { username: 'claimant', name: 'Claimant', teamName: 'Wrong', password: 'initial-password' })).status, 403);
    const bootstraps = databases.slice(0, 4).map((db) => createApi({ db, env, bootstrapOnly: true }));
    const setup = await Promise.all(bootstraps.map((api, index) => call(api, '/auth/register', { username: `owner${index}`, name: `Owner ${index}`, teamName: 'Private studio', password: 'initial-password' })));
    assert.deepEqual(setup.map((result) => result.status).sort(), [201, 409, 409, 409]);
    assert.equal((await databases[0].query('SELECT COUNT(*)::integer AS count FROM sessions')).rows[0].count, 0);
    const owner = setup.find((result) => result.status === 201).body.user;
    const auth = await call(publicApi, '/auth/login', { username: owner.username, password: 'initial-password' });
    assert.equal(auth.status, 200);
    const token = auth.body.token;
    const apis = databases.slice(0, 4).map((db) => createApi({ db, env }));
    const snapshot = (await call(publicApi, '/state', undefined, token, undefined, 'GET')).body;
    const timerBody = { teamId: snapshot.team.id, projectId: snapshot.projects[0].id, date: '2026-09-15', task: 'Concurrent native timers' };
    const starts = await Promise.all(apis.map((api, index) => call(api, '/timer/start', timerBody, token, `concurrent-start-${index}`)));
    assert.ok(starts.every((result) => result.status === 200), JSON.stringify(starts));
    assert.equal((await databases[0].query('SELECT COUNT(*)::integer AS count FROM entries WHERE started_at IS NOT NULL')).rows[0].count, 1);
    const concurrentSnapshots = await Promise.all(Array.from({ length: 8 }, async (_, index) => {
      if (index % 2) return call(apis[index % 4], '/timer/start', timerBody, token);
      return call(apis[index % 4], '/state', undefined, token, undefined, 'GET');
    }));
    for (const response of concurrentSnapshots.filter((result) => result.body.entries)) {
      assert.equal(response.status, 200);
      const runningRows = response.body.entries.filter((entry) => entry.startedAt);
      assert.equal(runningRows.length, 1);
      assert.deepEqual(runningRows[0], response.body.runningEntry, 'A snapshot must not mix states from before and after a concurrent timer switch.');
    }
    const manualBody = { ...timerBody, durationSeconds: 1800 };
    const duplicates = await Promise.all(apis.map((api) => call(api, '/entries', manualBody, token, 'shared-request-0001')));
    assert.ok(duplicates.every((result) => result.status === 201), JSON.stringify(duplicates));
    assert.equal(new Set(duplicates.map((result) => result.body.entry.id)).size, 1);
    assert.equal(duplicates[0].body.entry.date, '2026-09-15');
    const second = await call(publicApi, '/members', { teamId: snapshot.team.id, username: 'secondadmin', name: 'Second Admin', password: 'second-password', role: 'admin' }, token);
    assert.equal(second.status, 201);
    const secondLogin = await call(publicApi, '/auth/login', { username: 'secondadmin', password: 'second-password' });
    const ownerMembership = snapshot.members.find((member) => member.userId === owner.id);
    const demotions = await Promise.all([
      call(apis[0], `/members/${ownerMembership.id}`, { role: 'member' }, token, undefined, 'PATCH'),
      call(apis[1], `/members/${second.body.member.id}`, { role: 'member' }, secondLogin.body.token, undefined, 'PATCH'),
    ]);
    assert.deepEqual(demotions.map((result) => result.status).sort(), [200, 409]);
    assert.equal((await databases[0].query("SELECT COUNT(*)::integer AS count FROM memberships WHERE role='admin'")).rows[0].count, 1);
    const creator = (await control.query('SELECT rolcreaterole,rolsuper FROM pg_roles WHERE rolname=current_user')).rows[0];
    if (creator.rolcreaterole || creator.rolsuper) {
      readerRole = `${schema}_reader`;
      await control.query(`CREATE ROLE ${readerRole} NOLOGIN`);
      await control.query(`GRANT USAGE ON SCHEMA ${schema} TO ${readerRole}`);
      await control.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA ${schema} TO ${readerRole}`);
      const connection = await control.connect();
      try {
        await connection.query('BEGIN');
        await connection.query(`SET LOCAL ROLE ${readerRole}`);
        for (const table of ['users', 'sessions', 'entries', 'memberships', 'mutation_requests', 'access_keys', 'waitlist']) {
          assert.equal((await connection.query(`SELECT * FROM ${schema}.${table}`)).rows.length, 0, `An unprivileged role must not see ${table}, even with SELECT granted.`);
        }
        await assert.rejects(connection.query(`INSERT INTO ${schema}.users(id,username,name,password_hash) VALUES('untrusted','untrusted','Untrusted','not-a-real-hash')`), (error) => error.code === '42501');
      } finally { await connection.query('ROLLBACK'); connection.release(); }
    }
  } finally {
    await Promise.all(databases.map((db) => db.close()));
    await control.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await control.query(`DROP SCHEMA IF EXISTS ${nativeSchema} CASCADE`);
    if (readerRole) await control.query(`DROP ROLE ${readerRole}`);
    await control.end();
  }
});
