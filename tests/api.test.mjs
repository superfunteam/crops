import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, scryptSync } from 'node:crypto';
import pg from 'pg';
import { createDatabase } from '../server/db.mjs';
import { createApi } from '../server/api.mjs';
import { digest } from '../server/auth.mjs';

const env = { NODE_ENV: 'test' };
let postgresControl, postgresSchema, testUrl;
if (process.env.CROPS_TEST_DATABASE_URL) {
  postgresControl = new pg.Pool({ connectionString: process.env.CROPS_TEST_DATABASE_URL, max: 1 });
  postgresSchema = `crops_test_${randomUUID().replaceAll('-', '')}`;
  await postgresControl.query(`CREATE SCHEMA ${postgresSchema}`);
  const url = new URL(process.env.CROPS_TEST_DATABASE_URL);
  url.searchParams.set('options', `-c search_path=${postgresSchema}`);
  testUrl = url.toString();
}
const db = await createDatabase({ dataDir: 'memory://', env, ...(testUrl ? { url: testUrl } : {}) });
const api = createApi({ db, env });
let admin, outsider, member, initial, foreign, memberId;
function caller(handler = api) {
  return async (method, path, body, token, extraHeaders = {}) => {
    const response = await handler(new Request(`http://localhost:8787/api${path}`, {
      method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }), { ip: '127.0.0.1' });
    const raw = await response.text();
    return { status: response.status, body: raw ? JSON.parse(raw) : null, headers: response.headers };
  };
}
const call = caller();
function ok(response, status = 200) { assert.equal(response.status, status, JSON.stringify(response.body)); return response.body; }
async function state(token, teamId) { return ok(await call('GET', `/state${teamId ? `?teamId=${teamId}` : ''}`, undefined, token)); }
async function manual(overrides = {}, token = admin.token) {
  return call('POST', '/entries', { teamId: initial.team.id, projectId: initial.projects[0].id, task: 'Design', notes: 'Details', date: '2026-09-15', durationSeconds: 3600, billable: true, ...overrides }, token);
}

test('Crops API security and synchronization', async (t) => {
  t.after(async () => {
    await db.close();
    if (postgresControl) {
      await postgresControl.query(`DROP SCHEMA IF EXISTS ${postgresSchema} CASCADE`);
      await postgresControl.end();
    }
  });
  await t.test('registers real accounts, creates a useful workspace, and hashes secrets', async () => {
    const result = await call('POST', '/auth/register', { username: 'Alex', password: 'a-good-password', name: 'Alex', teamName: 'Design team' });
    admin = ok(result, 201);
    assert.match(result.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
    assert.equal(admin.user.username, 'alex');
    assert.equal(admin.token.length, 43);
    initial = await state(admin.token);
    assert.equal(initial.team.role, 'admin');
    assert.equal(initial.projects[0].name, 'General');
    assert.equal(initial.runningEntry, null);
    const stored = (await db.query('SELECT password_hash FROM users WHERE id=$1', [admin.user.id])).rows[0];
    assert.match(stored.password_hash, /^scrypt:32768:8:3:/);
    assert.ok(!stored.password_hash.includes('a-good-password'));
    assert.equal((await db.query('SELECT token_hash FROM sessions WHERE user_id=$1', [admin.user.id])).rows[0].token_hash, digest(admin.token));
    outsider = ok(await call('POST', '/auth/register', { username: 'Other', password: 'another-password', name: 'Other', teamName: 'Other team' }), 201);
    foreign = await state(outsider.token);
  });
  await t.test('requires valid credentials and accepts its HttpOnly cookie', async () => {
    assert.equal((await call('GET', '/state')).status, 401);
    assert.equal((await call('POST', '/auth/login', { username: 'Alex', password: 'wrong-password' })).status, 401);
    const loggedIn = ok(await call('POST', '/auth/login', { username: 'ALEX', password: 'a-good-password' }));
    assert.equal(loggedIn.user.id, admin.user.id);
    assert.equal((await call('GET', '/state', undefined, undefined, { Cookie: `crops_session=${loggedIn.token}` })).status, 200);
    ok(await call('POST', '/auth/logout', {}, loggedIn.token));
    assert.equal((await call('GET', '/state', undefined, loggedIn.token)).status, 401);
  });
  await t.test('isolates teams and rejects cross-team project references', async () => {
    assert.equal((await call('GET', `/state?teamId=${initial.team.id}`, undefined, outsider.token)).status, 403);
    assert.equal((await manual({ projectId: foreign.projects[0].id })).status, 400);
    assert.equal((await manual({ teamId: foreign.team.id })).status, 403);
    assert.equal((await call('PATCH', `/projects/${initial.projects[0].id}`, { name: 'Stolen' }, outsider.token)).status, 403);
  });
  await t.test('admins create members without giving members management powers', async () => {
    const added = ok(await call('POST', '/members', { teamId: initial.team.id, username: 'sam', password: 'sam-password', name: 'Sam', role: 'member' }, admin.token), 201);
    memberId = added.member.id;
    member = ok(await call('POST', '/auth/login', { username: 'sam', password: 'sam-password' }));
    assert.equal((await state(member.token)).team.role, 'member');
    assert.equal((await call('POST', '/clients', { teamId: initial.team.id, name: 'Nope' }, member.token)).status, 403);
    assert.equal((await call('POST', '/members', { teamId: initial.team.id, username: 'outsider' }, member.token)).status, 403);
    const ownEntry = ok(await manual({}, member.token), 201).entry;
    assert.equal(ownEntry.date, '2026-09-15', 'Calendar dates must survive PostgreSQL parsing in every process timezone.');
    const adminEntry = ok(await manual(), 201).entry;
    const memberState = await state(member.token);
    assert.ok(memberState.entries.every((entry) => entry.userId === member.user.id));
    assert.ok((await state(admin.token)).entries.some((entry) => entry.id === ownEntry.id));
    assert.equal((await call('PATCH', `/entries/${adminEntry.id}`, { version: 1, notes: 'Nope' }, member.token)).status, 403);
    assert.equal((await call('PATCH', `/entries/${ownEntry.id}`, { version: 1, status: 'paid' }, member.token)).status, 403);
    assert.equal((await manual({ userId: admin.user.id }, member.token)).status, 403);
  });
  await t.test('only one timer runs across concurrent requests and all teams', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => call('POST', '/timer/start', { teamId: initial.team.id, projectId: initial.projects[0].id, task: `Concurrent ${i}`, billable: true, date: '2026-09-15' }, admin.token)));
    results.forEach((result) => ok(result));
    let current = await state(admin.token);
    assert.equal(current.entries.filter((entry) => entry.startedAt).length, 1);
    assert.equal((await db.query('SELECT COUNT(*)::integer AS count FROM entries WHERE user_id=$1 AND started_at IS NOT NULL', [admin.user.id])).rows[0].count, 1);
    const previous = current.runningEntry;
    // Move its clock back to verify elapsed accumulation without a wall-clock sleep.
    await db.query("UPDATE entries SET started_at=clock_timestamp()-interval '65 seconds' WHERE id=$1", [previous.id]);
    const secondTeam = ok(await call('POST', '/teams', { name: 'Second team' }, admin.token), 201).team;
    const nextState = await state(admin.token, secondTeam.id);
    const next = ok(await call('POST', '/timer/start', { teamId: secondTeam.id, projectId: nextState.projects[0].id, task: 'Other team' }, admin.token)).entry;
    current = await state(admin.token);
    assert.equal(current.runningEntry.id, next.id);
    const stopped = current.entries.find((entry) => entry.id === previous.id);
    assert.equal(stopped.startedAt, null);
    assert.ok(stopped.durationSeconds >= 65);
    const stoppedNext = ok(await call('POST', '/timer/stop', { entryId: next.id }, admin.token)).entry;
    assert.equal(stoppedNext.startedAt, null);
    const stoppedAgain = ok(await call('POST', '/timer/stop', { entryId: next.id }, admin.token)).entry;
    assert.deepEqual(stoppedAgain, stoppedNext);
    assert.equal((await state(admin.token)).runningEntry, null);
  });
  await t.test('rejects stale edits instead of losing another device’s changes', async () => {
    const entry = ok(await manual(), 201).entry;
    const results = await Promise.all(['Mac', 'Android'].map((notes) => call('PATCH', `/entries/${entry.id}`, { version: entry.version, notes }, admin.token)));
    assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
    assert.equal(results.find((result) => result.status === 409).body.code, 'version_conflict');
    assert.equal((await call('DELETE', `/entries/${entry.id}?version=1`, undefined, admin.token)).status, 409);
    assert.equal((await call('PATCH', `/entries/${entry.id}`, { notes: 'Missing version' }, admin.token)).status, 400);
  });
  await t.test('replays duplicate writes atomically without adding time or restarting an old timer', async () => {
    const body = { teamId: initial.team.id, projectId: initial.projects[0].id, task: 'One manual entry', date: '2026-09-15', durationSeconds: 900, billable: true };
    const headers = { 'Idempotency-Key': 'manual-request-0001' };
    const responses = await Promise.all(Array.from({ length: 4 }, () => call('POST', '/entries', body, admin.token, headers)));
    responses.forEach((response) => ok(response, 201));
    assert.equal(new Set(responses.map((response) => response.body.entry.id)).size, 1);
    assert.equal((await state(admin.token)).entries.filter((entry) => entry.task === body.task).length, 1);
    assert.equal((await call('POST', '/entries', { ...body, durationSeconds: 100 }, admin.token, headers)).status, 409);
    const timerBody = { teamId: initial.team.id, projectId: initial.projects[0].id, task: 'Idempotent start' };
    const timerHeaders = { 'Idempotency-Key': 'timer-request-0001' };
    const timer = ok(await call('POST', '/timer/start', timerBody, admin.token, timerHeaders)).entry;
    ok(await call('POST', '/timer/stop', { entryId: timer.id }, admin.token));
    const retry = ok(await call('POST', '/timer/start', timerBody, admin.token, timerHeaders)).entry;
    assert.equal(retry.id, timer.id);
    assert.equal((await state(admin.token)).runningEntry, null, 'A replay must not restart the now-stopped timer.');
    const otherUser = ok(await call('POST', '/entries', body, member.token, headers), 201).entry;
    assert.notEqual(otherUser.id, responses[0].body.entry.id, 'Keys are scoped to the account.');
  });
  await t.test('returns unchanged snapshots with no body and a fresh database clock', async () => {
    const first = await call('GET', '/state', undefined, admin.token);
    const etag = first.headers.get('etag');
    assert.ok(etag);
    assert.ok(etag.startsWith('W/'), 'The state validator excludes the changing clock field.');
    const unchanged = await call('GET', '/state', undefined, admin.token, { 'If-None-Match': etag });
    assert.equal(unchanged.status, 304);
    assert.equal(unchanged.body, null);
    assert.equal(unchanged.headers.get('cache-control'), 'no-store');
    assert.ok(Date.parse(unchanged.headers.get('x-crops-server-time')) >= Date.parse(first.body.serverTime));
    assert.ok(Math.abs(Date.parse(unchanged.headers.get('date')) - Date.parse(unchanged.headers.get('x-crops-server-time'))) < 1000);
    const compressedTag = etag.replace(/"$/, '-df"');
    for (const validator of [compressedTag, compressedTag.slice(2), etag.slice(2), `"another-tag", ${compressedTag}`]) {
      const compressed = await call('GET', '/state', undefined, admin.token, { 'If-None-Match': validator });
      assert.equal(compressed.status, 304, 'A Netlify compressed variant must match the same semantic snapshot.');
      assert.ok(compressed.headers.get('x-crops-server-time'));
    }
    for (const invalid of [etag.replace(/"$/, '-other"'), `W/"prefix-${etag.slice(3)}`, `W/"${'0'.repeat(64)}-df"`]) {
      assert.equal((await call('GET', '/state', undefined, admin.token, { 'If-None-Match': invalid })).status, 200);
    }
    ok(await manual({ task: 'Changes the snapshot' }), 201);
    const changed = await call('GET', '/state', undefined, admin.token, { 'If-None-Match': etag });
    assert.equal(changed.status, 200);
    assert.notEqual(changed.headers.get('etag'), etag);
    const timer = ok(await call('POST', '/timer/start', { teamId: initial.team.id, projectId: initial.projects[0].id }, admin.token)).entry;
    const running = await call('GET', '/state', undefined, admin.token);
    assert.equal((await call('GET', '/state', undefined, admin.token, { 'If-None-Match': running.headers.get('etag') })).status, 304);
    ok(await call('POST', '/timer/stop', { entryId: timer.id }, admin.token));
  });
  await t.test('locks invoiced and paid time until an explicit admin unlock', async () => {
    let entry = ok(await manual(), 201).entry;
    entry = ok(await call('PATCH', `/entries/${entry.id}`, { version: entry.version, status: 'invoiced' }, admin.token)).entry;
    assert.equal((await call('PATCH', `/entries/${entry.id}`, { version: entry.version, notes: 'Changed' }, admin.token)).status, 409);
    assert.equal((await call('DELETE', `/entries/${entry.id}?version=${entry.version}`, undefined, admin.token)).status, 409);
    assert.equal((await call('POST', '/timer/start', { teamId: initial.team.id, entryId: entry.id }, admin.token)).status, 409);
    entry = ok(await call('PATCH', `/entries/${entry.id}`, { version: entry.version, status: 'paid' }, admin.token)).entry;
    assert.equal((await call('PATCH', `/entries/${entry.id}`, { version: entry.version, status: 'unbilled', durationSeconds: 2 }, admin.token)).status, 409);
    entry = ok(await call('PATCH', `/entries/${entry.id}`, { version: entry.version, status: 'unbilled' }, admin.token)).entry;
    entry = ok(await call('PATCH', `/entries/${entry.id}`, { version: entry.version, durationSeconds: 7200 }, admin.token)).entry;
    ok(await call('DELETE', `/entries/${entry.id}?version=${entry.version}`, undefined, admin.token));
    const nonbillable = ok(await manual({ billable: false }), 201).entry;
    assert.equal((await call('PATCH', `/entries/${nonbillable.id}`, { version: nonbillable.version, status: 'paid' }, admin.token)).status, 400);
  });
  await t.test('validates manual dates, durations, and running entry changes', async () => {
    for (const invalid of [{ date: '2026-02-31' }, { durationSeconds: -1 }, { durationSeconds: '3600' }, { durationSeconds: 0.5 }, { billable: 'yes' }, { durationSeconds: 604801 }]) assert.equal((await manual(invalid)).status, 400, JSON.stringify(invalid));
    const timer = ok(await call('POST', '/timer/start', { teamId: initial.team.id, projectId: initial.projects[0].id }, admin.token)).entry;
    assert.equal((await call('PATCH', `/entries/${timer.id}`, { version: timer.version, durationSeconds: 20 }, admin.token)).status, 409);
    assert.equal((await call('PATCH', `/entries/${timer.id}`, { version: timer.version, status: 'paid' }, admin.token)).status, 409);
    assert.equal((await call('PATCH', `/projects/${timer.projectId}`, { archived: true }, admin.token)).status, 409);
    ok(await call('POST', '/timer/stop', { entryId: timer.id }, admin.token));
  });
  await t.test('manages clients and projects with validated team ownership', async () => {
    const client = ok(await call('POST', '/clients', { teamId: initial.team.id, name: 'Acme', email: 'billing@example.test' }, admin.token), 201).client;
    const project = ok(await call('POST', '/projects', { teamId: initial.team.id, clientId: client.id, name: 'Website', rate: 125, budgetHours: 80, color: '#aabbcc' }, admin.token), 201).project;
    assert.equal(project.rate, 125);
    assert.equal(project.budgetHours, 80);
    assert.equal((await call('POST', '/projects', { teamId: initial.team.id, clientId: foreign.clients[0].id, name: 'Wrong' }, admin.token)).status, 400);
    assert.equal((await call('PATCH', `/projects/${project.id}`, { rate: -10 }, admin.token)).status, 400);
    ok(await call('PATCH', `/projects/${project.id}`, { archived: true }, admin.token));
    assert.equal((await manual({ projectId: project.id })).status, 409);
    ok(await call('PATCH', `/projects/${project.id}`, { archived: false }, admin.token));
    ok(await manual({ projectId: project.id }), 201);
  });
  await t.test('protects the last team admin and existing member credentials', async () => {
    const adminMembership = initial.members.find((m) => m.userId === admin.user.id);
    assert.equal((await call('PATCH', `/members/${adminMembership.id}`, { role: 'member' }, admin.token)).status, 409);
    assert.equal((await call('PATCH', `/members/${memberId}`, { password: 'attack-password' }, admin.token)).status, 400);
    const joined = ok(await call('POST', '/members', { teamId: foreign.team.id, username: 'sam', password: 'attack-password', name: 'Changed' }, outsider.token), 201).member;
    assert.equal(joined.name, 'Sam');
    assert.equal((await call('POST', '/auth/login', { username: 'sam', password: 'attack-password' })).status, 401);
    assert.equal((await call('POST', '/auth/login', { username: 'sam', password: 'sam-password' })).status, 200);
  });
  await t.test('password changes revoke other sessions and expired sessions fail', async () => {
    const old = ok(await call('POST', '/auth/login', { username: 'sam', password: 'sam-password' }));
    ok(await call('POST', '/auth/password', { currentPassword: 'sam-password', newPassword: 'better-sam-password' }, member.token));
    assert.equal((await call('GET', '/state', undefined, old.token)).status, 401);
    assert.equal((await call('GET', '/state', undefined, member.token)).status, 200);
    assert.equal((await call('POST', '/auth/login', { username: 'sam', password: 'sam-password' })).status, 401);
    const fresh = ok(await call('POST', '/auth/login', { username: 'sam', password: 'better-sam-password' }));
    await db.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1", [digest(fresh.token)]);
    assert.equal((await call('GET', '/state', undefined, fresh.token)).status, 401);
  });
  await t.test('persists authentication rate limits across API instances', async () => {
    for (let i = 0; i < 15; i++) assert.equal((await call('POST', '/auth/login', { username: 'unknown', password: 'wrong-password' })).status, 401);
    const anotherApi = caller(createApi({ db, env }));
    const limited = await anotherApi('POST', '/auth/login', { username: 'unknown', password: 'wrong-password' });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '900');
  });
  await t.test('rejects cross-origin requests, disables registration when configured, and fails closed in production', async () => {
    assert.equal((await call('GET', '/state', undefined, admin.token, { Origin: 'https://attacker.test' })).status, 403);
    const closed = caller(createApi({ db, env: { ...env, CROPS_ALLOW_REGISTRATION: 'false' } }));
    assert.equal((await closed('POST', '/auth/register', { username: 'closed', password: 'strong-password', name: 'Closed', teamName: 'Closed' })).status, 403);
    const production = caller(createApi({ env: { NODE_ENV: 'production' } }));
    const missingDatabase = await production('GET', '/health');
    assert.equal(missingDatabase.status, 503);
    assert.equal(missingDatabase.body.code, 'database_unconfigured');
  });
  await t.test('requires verified origins for cookie writes and never downgrades invalid bearer auth', async () => {
    const headers = { Cookie: `crops_session=${admin.token}` };
    assert.equal((await call('POST', '/entries', {}, undefined, headers)).status, 403);
    assert.equal((await call('POST', '/entries', {}, undefined, { ...headers, Origin: 'null' })).status, 403);
    assert.equal((await call('POST', '/entries', {}, undefined, { ...headers, Origin: 'http://localhost:8787' })).status, 400);
    assert.equal((await call('POST', '/entries', {}, undefined, { ...headers, 'Sec-Fetch-Site': 'same-origin' })).status, 400);
    assert.equal((await call('GET', '/state', undefined, undefined, { ...headers, Authorization: 'Basic invalid' })).status, 401);
  });
  await t.test('validates JSON media types, UTF-8 byte limits, non-finite numbers, and null bytes', async () => {
    assert.equal((await call('POST', '/entries', {}, admin.token, { 'Content-Type': 'application/jsonp' })).status, 415);
    assert.equal((await manual({ notes: 'null\0byte' })).status, 400);
    assert.equal((await manual({ projectId: {} })).status, 400);
    assert.equal((await manual({ userId: null })).status, 400);
    const request = (raw) => api(new Request('http://localhost:8787/api/entries', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` }, body: raw }));
    assert.equal((await request('{"durationSeconds":1e400}')).status, 400);
    assert.equal((await request('{invalid')).status, 400);
    assert.equal((await request(JSON.stringify({ notes: 'あ'.repeat(22000) }))).status, 413);
  });
  await t.test('throttles password guessing even from an authenticated session', async () => {
    for (let i = 0; i < 15; i++) assert.equal((await call('POST', '/auth/password', { currentPassword: 'wrong-password', newPassword: 'some-new-password' }, outsider.token)).status, 401);
    assert.equal((await call('POST', '/auth/password', { currentPassword: 'another-password', newPassword: 'some-new-password' }, outsider.token)).status, 429);
  });
  await t.test('upgrades early local-build password hashes without locking existing users out', async () => {
    const salt = '00112233445566778899aabbccddeeff';
    const legacy = `scrypt:${salt}:${scryptSync('another-password', salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex')}`;
    await db.query('UPDATE users SET password_hash=$1 WHERE id=$2', [legacy, outsider.user.id]);
    const login = ok(await call('POST', '/auth/login', { username: 'other', password: 'another-password' }));
    assert.equal(login.user.id, outsider.user.id);
    assert.match((await db.query('SELECT password_hash FROM users WHERE id=$1', [outsider.user.id])).rows[0].password_hash, /^scrypt:32768:8:3:/);
  });
});

test('closed registration rejects first signup and only one owner bootstrap wins', async () => {
  const isolated = await createDatabase({ dataDir: 'memory://', env });
  try {
    const closedEnv = { ...env, CROPS_ALLOW_REGISTRATION: 'false' };
    const publicSignup = caller(createApi({ db: isolated, env: closedEnv }));
    assert.equal((await publicSignup('POST', '/auth/register', { username: 'claimant', password: 'claimant-password', name: 'Claimant', teamName: 'Wrong team' })).status, 403);
    const firstOnly = caller(createApi({ db: isolated, env: closedEnv, bootstrapOnly: true }));
    const results = await Promise.all(['first', 'second'].map((username) => firstOnly('POST', '/auth/register', { username, password: 'initial-password', name: username, teamName: 'Private team' })));
    assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
    assert.equal((await isolated.query('SELECT COUNT(*)::integer AS count FROM users')).rows[0].count, 1);
    assert.equal(results.find((result) => result.status === 201).body.token, undefined);
    assert.equal((await isolated.query('SELECT COUNT(*)::integer AS count FROM sessions')).rows[0].count, 0, 'Owner bootstrap must not create a session.');
  } finally { await isolated.close(); }
});

test('local data and sessions survive closing and reopening the database', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'crops-api-'));
  let durable;
  try {
    durable = await createDatabase({ dataDir: directory, env });
    const first = caller(createApi({ db: durable, env }));
    const user = ok(await first('POST', '/auth/register', { username: 'durable', password: 'durable-password', name: 'Durable', teamName: 'Persisted team' }), 201);
    const before = ok(await first('GET', '/state', undefined, user.token));
    const entry = ok(await first('POST', '/entries', { teamId: before.team.id, projectId: before.projects[0].id, task: 'Survives restart', notes: '', date: '2026-09-15', durationSeconds: 2700, billable: true }, user.token), 201).entry;
    await durable.close();
    durable = await createDatabase({ dataDir: directory, env });
    const reopened = caller(createApi({ db: durable, env }));
    const after = ok(await reopened('GET', '/state', undefined, user.token));
    assert.equal(after.team.id, before.team.id);
    assert.equal(after.entries.find((item) => item.id === entry.id).durationSeconds, 2700);
  } finally {
    if (durable) await durable.close();
    await rm(directory, { recursive: true, force: true });
  }
});
