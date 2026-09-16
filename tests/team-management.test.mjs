import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../server/db.mjs';
import { createApi } from '../server/api.mjs';

test('team management protects access, credentials, timers, and historical attribution', async t => {
  const db = await createDatabase({ dataDir: 'memory://', env: { NODE_ENV: 'test' } });
  t.after(() => db.close());
  const api = createApi({ db, env: { NODE_ENV: 'test' } });
  const call = async (method, path, body, token) => {
    const response = await api(new Request(`http://localhost/api${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }), { ip: 'team-management-test' });
    return { status: response.status, body: await response.json() };
  };
  const ok = (r, status = 200) => { assert.equal(r.status, status, JSON.stringify(r.body)); return r.body; };
  const owner = ok(await call('POST', '/auth/register', { username: 'owner', password: 'owner-password', name: 'Owner', teamName: 'Studio' }), 201);
  const foreign = ok(await call('POST', '/auth/register', { username: 'foreign', password: 'foreign-password', name: 'Foreign', teamName: 'Other' }), 201);
  let state = ok(await call('GET', '/state', null, owner.token));
  const teamId = state.team.id, projectId = state.projects[0].id, ownerMember = state.members[0].id;
  const teammate = ok(await call('POST', '/members', { teamId, username: 'teammate', name: 'Teammate', password: 'member-password' }, owner.token), 201).member;
  let login = ok(await call('POST', '/auth/login', { username: 'teammate', password: 'member-password' }));
  await t.test('only admins can edit team names and member profiles', async () => {
    assert.equal((await call('PATCH', `/teams/${teamId}`, { name: 'Attack' }, foreign.token)).status, 403);
    assert.equal((await call('PATCH', `/teams/${teamId}`, { name: 'Attack' }, login.token)).status, 403);
    assert.equal((await call('PATCH', `/members/${teammate.id}`, { name: 'Attack' }, login.token)).status, 403);
    ok(await call('PATCH', `/teams/${teamId}`, { name: 'Renamed studio' }, owner.token));
    ok(await call('PATCH', `/members/${teammate.id}`, { name: 'Updated teammate' }, owner.token));
    state = ok(await call('GET', '/state', null, owner.token));
    assert.equal(state.team.name, 'Renamed studio');
    assert.equal(state.members.find(m => m.id === teammate.id).name, 'Updated teammate');
    assert.equal(state.members.find(m => m.id === teammate.id).canManageAccount, true);
  });
  await t.test('password reset requires admin reauthentication and revokes every target session', async () => {
    const second = ok(await call('POST', '/auth/login', { username: 'teammate', password: 'member-password' }));
    const payload = { currentPassword: 'owner-password', newPassword: 'changed-password' };
    assert.equal((await call('POST', `/members/${teammate.id}/password`, payload, foreign.token)).status, 403);
    assert.equal((await call('POST', `/members/${teammate.id}/password`, payload, login.token)).status, 403);
    assert.equal((await call('POST', `/members/${teammate.id}/password`, { ...payload, currentPassword: 'incorrect-password' }, owner.token)).status, 401);
    assert.equal((await call('POST', `/members/${teammate.id}/password`, { ...payload, newPassword: 'short' }, owner.token)).status, 400);
    ok(await call('POST', `/members/${teammate.id}/password`, payload, owner.token));
    assert.equal((await call('GET', '/state', null, login.token)).status, 401);
    assert.equal((await call('GET', '/state', null, second.token)).status, 401);
    assert.equal((await call('POST', '/auth/login', { username: 'teammate', password: 'member-password' })).status, 401);
    login = ok(await call('POST', '/auth/login', { username: 'teammate', password: 'changed-password' }));
    assert.equal((await call('POST', `/members/${ownerMember}/password`, payload, owner.token)).status, 400);
  });
  await t.test('adding an existing account cannot grant control over its shared credentials', async () => {
    const joined = ok(await call('POST', '/members', { teamId, username: 'foreign' }, owner.token), 201).member;
    assert.equal((await call('POST', `/members/${joined.id}/password`, { currentPassword: 'owner-password', newPassword: 'attack-password' }, owner.token)).status, 409);
    assert.equal((await call('PATCH', `/members/${joined.id}`, { name: 'Attack' }, owner.token)).status, 409);
    assert.equal(ok(await call('GET', '/state', null, owner.token)).members.find(m => m.id === joined.id).canManageAccount, false);
    ok(await call('POST', '/auth/login', { username: 'foreign', password: 'foreign-password' }));
    ok(await call('DELETE', `/members/${joined.id}`, null, owner.token));
    ok(await call('GET', '/state', null, foreign.token));
  });
  await t.test('removing a member stops their timer, preserves history, and denies further access', async () => {
    const running = ok(await call('POST', '/timer/start', { teamId, projectId, task: 'Retain this work' }, login.token)).entry;
    assert.equal((await call('DELETE', `/members/${teammate.id}`, null, login.token)).status, 403);
    assert.equal((await call('DELETE', `/members/${teammate.id}`, null, foreign.token)).status, 403);
    ok(await call('DELETE', `/members/${teammate.id}`, null, owner.token));
    const after = ok(await call('GET', '/state', null, owner.token));
    assert.equal(after.members.some(m => m.id === teammate.id), false);
    assert.equal(after.entries.find(e => e.id === running.id).startedAt, null);
    assert.equal(after.formerMembers.find(m => m.id === teammate.userId).name, 'Updated teammate');
    assert.equal((await call('GET', `/state?teamId=${teamId}`, null, login.token)).status, 403);
    assert.equal((await call('POST', '/timer/start', { teamId, projectId }, login.token)).status, 403);
    ok(await call('POST', '/members', { teamId, username: 'teammate' }, owner.token), 201);
    assert.ok(ok(await call('GET', '/state', null, login.token)).entries.some(e => e.id === running.id));
  });
  await t.test('a concurrent timer start cannot leave a removed member running', async () => {
    const current = ok(await call('GET', '/state', null, owner.token)).members.find(m => m.userId === teammate.userId);
    const results = await Promise.all([
      call('POST', '/timer/start', { teamId, projectId }, login.token),
      call('DELETE', '/members/' + current.id, null, owner.token),
    ]);
    assert.ok([200, 403, 409].includes(results[0].status));
    ok(results[1]);
    const after = ok(await call('GET', '/state', null, owner.token));
    assert.equal(after.entries.some(e => e.userId === teammate.userId && e.startedAt), false);
  });
  await t.test('last admin cannot be removed or demoted', async () => {
    assert.equal((await call('DELETE', `/members/${ownerMember}`, null, owner.token)).status, 409);
    assert.equal((await call('PATCH', `/members/${ownerMember}`, { role: 'member' }, owner.token)).status, 409);
    assert.equal((await call('PATCH', `/teams/${teamId}`, { name: '' }, owner.token)).status, 400);
  });
});
