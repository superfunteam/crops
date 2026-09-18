import { randomUUID } from 'node:crypto';
import { createDatabase, productionEnvironment, resolveDatabaseConfig } from './db.mjs';
import { createAccessKey, createSession, digest, hashPassword, isAccessKey, needsPasswordUpgrade, sessionCookie, verifyPassword } from './auth.mjs';

class ApiError extends Error {
  constructor(status, code, message, retryAfter) { super(message); this.status = status; this.code = code; this.retryAfter = retryAfter; }
}
const fail = (status, code, message, retryAfter) => { throw new ApiError(status, code, message, retryAfter); };
const one = async (tx, sql, args = []) => (await tx.query(sql, args)).rows[0];
const iso = (value) => value ? new Date(value).toISOString() : null;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const publicUser = (row) => ({ id: row.id, name: row.name, username: row.username });
const clientJson = (row) => ({ id: row.id, teamId: row.team_id, name: row.name, email: row.email, archived: row.archived });
const projectJson = (row) => ({ id: row.id, teamId: row.team_id, clientId: row.client_id, name: row.name, code: row.code, color: row.color, billable: row.billable, rate: Number(row.rate), budgetHours: Number(row.budget_hours), archived: row.archived });
const memberJson = (row) => ({ id: row.id, userId: row.user_id, name: row.name, username: row.username, role: row.role });
const agentJson = (row) => row.agent_tokens === null || row.agent_tokens === undefined ? null : { tokens: Number(row.agent_tokens), cost: Number(row.agent_cost), model: row.agent_model };
const accessKeyJson = (row) => ({ id: row.id, name: row.name, prefix: row.prefix, createdAt: iso(row.created_at), lastUsedAt: iso(row.last_used_at) });
const pick = (object, keys) => Object.fromEntries(keys.filter((key) => own(object, key)).map((key) => [key, object[key]]));
const entryJson = (row) => row ? ({ id: row.id, teamId: row.team_id, userId: row.user_id, projectId: row.project_id, task: row.task, notes: row.notes, date: typeof row.date === 'string' ? row.date.slice(0, 10) : new Date(row.date).toISOString().slice(0, 10), durationSeconds: Number(row.duration_seconds), startedAt: iso(row.started_at), billable: row.billable, status: row.status, agent: agentJson(row), version: row.version }) : null;

function string(value, name, { min = 0, max = 200, fallback } = {}) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string' || value.trim().length < min || value.length > max || value.includes('\0')) fail(400, 'invalid_input', `${name} must be ${min ? `${min}–` : 'at most '}${max} characters and contain no null characters.`);
  return value.trim();
}
function password(value, name = 'Password') {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) fail(400, 'invalid_input', `${name} must be 8–128 characters.`);
  return value;
}
function username(value) {
  const result = string(value, 'Username', { min: 3, max: 80 }).toLowerCase();
  if (!/^[a-z0-9._@+\-]+$/.test(result)) fail(400, 'invalid_input', 'Username may contain letters, numbers, ., _, @, +, and -.');
  return result;
}
function bool(value, name, fallback) {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'boolean') fail(400, 'invalid_input', `${name} must be true or false.`);
  return value;
}
function number(value, name, max = 1000000, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isInteger(value))) fail(400, 'invalid_input', `${name} must be a ${integer ? 'whole ' : ''}number from 0 to ${max}.`);
  return value;
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value || value < '2000-01-01' || value > '2100-12-31') fail(400, 'invalid_input', 'Date must be a valid YYYY-MM-DD date between 2000 and 2100.');
  return value;
}
// Agents report their own usage; Crops stores it and never meters anything.
function agent(value) {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => !['tokens', 'cost', 'model'].includes(key))) fail(400, 'invalid_input', 'Agent usage must be null or an object with tokens, cost, and an optional model.');
  const cost = number(value.cost, 'Agent cost');
  if (Math.abs(Math.round(cost * 100) - cost * 100) > 1e-6) fail(400, 'invalid_input', 'Agent cost must be a USD amount with at most two decimal places.');
  const model = value.model === undefined || value.model === null ? null : string(value.model, 'Agent model', { max: 100 }) || null;
  return { tokens: number(value.tokens, 'Agent tokens', 1e12, true), cost: Math.round(cost * 100) / 100, model };
}
const agentValues = (usage) => [usage?.tokens ?? null, usage?.cost ?? null, usage?.model ?? null];
function role(value = 'member') {
  if (!['admin', 'member'].includes(value)) fail(400, 'invalid_input', 'Role must be admin or member.');
  return value;
}
function checkVersion(value, row, optional = false) {
  if (value === undefined && optional) return;
  if (!Number.isInteger(value) || value < 1) fail(400, 'invalid_input', 'Provide the entry version from the latest state.');
  if (value !== row.version) fail(409, 'version_conflict', 'This entry changed on another device. Refresh and try again.');
}
async function membership(tx, teamId, userId, admin = false) {
  const row = await one(tx, 'SELECT * FROM memberships WHERE team_id=$1 AND user_id=$2', [teamId, userId]);
  if (!row) fail(403, 'team_access_denied', 'You do not have access to this team.');
  if (admin && row.role !== 'admin') fail(403, 'admin_required', 'A team admin is required for this action.');
  return row;
}
async function validProject(tx, projectId, teamId) {
  projectId = string(projectId, 'Project ID', { min: 1, max: 80 });
  const project = await one(tx, 'SELECT * FROM projects WHERE id=$1 AND team_id=$2 FOR SHARE', [projectId, teamId]);
  if (!project) fail(400, 'invalid_project', 'Choose a project in this team.');
  if (project.archived) fail(409, 'project_archived', 'This project is archived.');
  return project;
}
async function validClient(tx, clientId, teamId) {
  if (clientId === null || clientId === '') return null;
  if (typeof clientId !== 'string') fail(400, 'invalid_client', 'Choose a client in this team.');
  const client = await one(tx, 'SELECT * FROM clients WHERE id=$1 AND team_id=$2 FOR SHARE', [clientId, teamId]);
  if (!client || client.archived) fail(400, 'invalid_client', 'Choose an active client in this team.');
  return clientId;
}
async function createTeam(tx, userId, name) {
  const id = randomUUID();
  await tx.query('INSERT INTO teams(id,name) VALUES($1,$2)', [id, name]);
  await tx.query('INSERT INTO memberships(id,team_id,user_id,role) VALUES($1,$2,$3,$4)', [randomUUID(), id, userId, 'admin']);
  const clientId = randomUUID();
  await tx.query('INSERT INTO clients(id,team_id,name) VALUES($1,$2,$3)', [clientId, id, 'Internal']);
  await tx.query('INSERT INTO projects(id,team_id,client_id,name,billable) VALUES($1,$2,$3,$4,$5)', [randomUUID(), id, clientId, 'General', false]);
  return { id, name, role: 'admin' };
}
async function editableEntry(tx, id, user) {
  const first = await one(tx, 'SELECT * FROM entries WHERE id=$1', [id]);
  if (!first) fail(404, 'not_found', 'Time entry not found.');
  const member = await membership(tx, first.team_id, user.id);
  if (first.user_id !== user.id && member.role !== 'admin') fail(403, 'entry_access_denied', 'You can only edit your own time.');
  // Every timer/entry mutation locks its owner first, in the same order.
  await tx.query('SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE', [first.user_id]);
  const row = await one(tx, 'SELECT * FROM entries WHERE id=$1 FOR UPDATE', [id]);
  if (!row) fail(404, 'not_found', 'Time entry not found.');
  return { row, member };
}
async function stopEntry(tx, row, usage) {
  const setAgent = usage !== undefined && JSON.stringify(agentJson(row)) !== JSON.stringify(usage);
  if (!row.started_at && !setAgent) return row;
  if (setAgent && row.status !== 'unbilled') fail(409, 'entry_locked', 'This entry is locked. An admin must first mark it unbilled.');
  // GREATEST ignores the NULL elapsed time of an already-stopped entry.
  return one(tx, `UPDATE entries SET duration_seconds=duration_seconds+GREATEST(0,FLOOR(EXTRACT(EPOCH FROM (clock_timestamp()-started_at)))::integer), started_at=NULL${setAgent ? ',agent_tokens=$2,agent_cost=$3,agent_model=$4' : ''}, version=version+1 WHERE id=$1 RETURNING *`, [row.id, ...(setAgent ? agentValues(usage) : [])]);
}

async function throttle(db, limits, seconds, message) {
  const denied = await db.transaction(async (tx) => {
    await tx.query('DELETE FROM auth_limits WHERE reset_at < now()');
    let exceeded = false;
    for (const [key, limit] of limits) {
      const row = await one(tx, `INSERT INTO auth_limits(key,count,reset_at) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET count=auth_limits.count+1 RETURNING count`, [digest(key), new Date(Date.now() + seconds * 1000)]);
      exceeded ||= row.count > limit;
    }
    return exceeded;
  });
  if (denied) fail(429, 'rate_limited', message, seconds);
}
const authThrottle = (db, ip, account) => throttle(db, [[`ip:${ip}`, 100], [`account:${account}`, 15]], 900, 'Too many sign-in attempts. Please wait 15 minutes and try again.');

export function createApi(options = {}) {
  const env = options.env || process.env;
  let databasePromise;
  let databaseKey;
  const getDb = async () => {
    if (options.db) return options.db;
    // Netlify can rotate a branch's connection credentials between invocations.
    // Replace the pool when that URL changes; old requests retain their pool and
    // its idle connections drain naturally after 20 seconds.
    const resolvedConfig = await resolveDatabaseConfig({ env });
    const key = resolvedConfig.url || env.CROPS_DATA_DIR || 'local';
    if (!databasePromise || key !== databaseKey) {
      databaseKey = key;
      databasePromise = createDatabase({ env, resolvedConfig }).catch((error) => { if (databaseKey === key) databasePromise = undefined; throw error; });
    }
    return databasePromise;
  };

  return async function handleRequest(request, context = {}) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/\.netlify\/functions\/api/, '/api').replace(/^\/api/, '').replace(/\/$/, '') || '/';
    const origin = request.headers.get('origin');
    const allowedOrigins = (env.CROPS_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const originAllowed = !origin || origin === url.origin || allowedOrigins.includes(origin) || (!productionEnvironment(env) && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
    const headers = {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', 'Vary': 'Origin',
      ...(origin && originAllowed ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type,Idempotency-Key,If-None-Match', 'Access-Control-Expose-Headers': 'ETag,X-Crops-Server-Time,Date' } : {}),
    };
    const respond = (payload, status = 200, extra = {}) => new Response(JSON.stringify(payload), { status, headers: { ...headers, ...extra } });
    try {
      if (!originAllowed) fail(403, 'origin_denied', 'This request origin is not allowed.');
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      const hookMatch = path.match(/^\/hooks(?:\/([^/]+))?$/);
      let body = {};
      if (['POST', 'PATCH', 'DELETE'].includes(request.method)) {
        if (Number(request.headers.get('content-length') || 0) > 65536) fail(413, 'payload_too_large', 'Request body is too large.');
        const raw = await request.text();
        if (Buffer.byteLength(raw, 'utf8') > 65536) fail(413, 'payload_too_large', 'Request body is too large.');
        if (raw) {
          // Webhook senders (Shortcuts, Stream Deck) often cannot set a JSON media type.
          if (!hookMatch && (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') fail(415, 'json_required', 'Send a JSON request body.');
          try { body = JSON.parse(raw); } catch { fail(400, 'invalid_json', 'Request body must be valid JSON.'); }
          if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'invalid_json', 'Request body must be a JSON object.');
        }
      }
      let db;
      try { db = await getDb(); } catch (error) {
        const known = ['database_unconfigured', 'schema_uninitialized'].includes(error.code);
        fail(503, known ? error.code : 'database_unavailable', known ? error.message : 'Crops cannot connect to its database. Please try again shortly.');
      }
      if (path === '/health' && request.method === 'GET') {
        await db.query('SELECT 1');
        return respond({ ok: true, storage: db.kind, registrationEnabled: env.CROPS_ALLOW_REGISTRATION !== 'false', serverTime: new Date().toISOString() });
      }
      if (path === '/waitlist' && ['GET', 'POST'].includes(request.method)) {
        const spots = Math.max(0, Math.floor(Number(env.CROPS_WAITLIST_SPOTS ?? 24)) || 0);
        const count = async (q = db) => Number((await one(q, 'SELECT COUNT(*)::integer AS count FROM waitlist')).count);
        if (request.method === 'GET') { const claimed = await count(); return respond({ spots, claimed, remaining: Math.max(0, spots - claimed) }); }
        const email = string(body.email, 'Email', { min: 3, max: 254 }).toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'invalid_email', 'Enter a valid email address.');
        await throttle(db, [[`waitlist-ip:${context.ip || 'unknown'}`, 10]], 3600, 'Too many signups from this network. Please try again later.');
        const result = await db.transaction(async (tx) => {
          const added = await one(tx, 'INSERT INTO waitlist(email) VALUES($1) ON CONFLICT(email) DO NOTHING RETURNING created_at', [email]);
          const position = Number((await one(tx, 'SELECT COUNT(*)::integer AS count FROM waitlist WHERE created_at <= (SELECT created_at FROM waitlist WHERE email=$1)', [email])).count);
          const claimed = await count(tx);
          return { joined: Boolean(added), position, spots, claimed, remaining: Math.max(0, spots - claimed) };
        });
        return respond(result, result.joined ? 201 : 200);
      }
      if (['/auth/login', '/auth/register'].includes(path) && request.method === 'POST') {
        const account = username(body.username);
        const secret = password(body.password);
        await authThrottle(db, context.ip || 'unknown', account);
        const result = await db.transaction(async (tx) => {
          let user;
          if (path === '/auth/register') {
            // Public signup policy and owner bootstrapping share one database lock.
            await tx.query('SELECT id FROM app_locks WHERE id=1 FOR UPDATE');
            if (options.bootstrapOnly) {
              if (await one(tx, 'SELECT id FROM users LIMIT 1')) fail(409, 'already_bootstrapped', 'This database already has an account. Owner setup can only run on an empty Crops database.');
            } else if (env.CROPS_ALLOW_REGISTRATION === 'false') fail(403, 'registration_closed', 'Registration is closed. Ask a team admin to add your account.');
            const name = string(body.name, 'Name', { min: 1, max: 100 });
            const teamName = string(body.teamName, 'Team name', { min: 1, max: 100 });
            user = await one(tx, 'INSERT INTO users(id,username,name,password_hash) VALUES($1,$2,$3,$4) RETURNING *', [randomUUID(), account, name, await hashPassword(secret)]);
            await createTeam(tx, user.id, teamName);
          } else {
            user = await one(tx, 'SELECT * FROM users WHERE username=$1 FOR NO KEY UPDATE', [account]);
            const valid = await verifyPassword(secret, user?.password_hash);
            if (!valid || !user) fail(401, 'invalid_credentials', 'Username or password is incorrect.');
            if (needsPasswordUpgrade(user.password_hash)) await tx.query('UPDATE users SET password_hash=$1 WHERE id=$2', [await hashPassword(secret), user.id]);
          }
          if (options.bootstrapOnly && path === '/auth/register') return { user: publicUser(user) };
          const token = await createSession(tx, user.id);
          return { token, user: publicUser(user) };
        });
        return respond(result, path === '/auth/register' ? 201 : 200, result.token ? { 'Set-Cookie': sessionCookie(result.token, productionEnvironment(env) || url.protocol === 'https:') } : {});
      }
      const authorization = request.headers.get('authorization');
      const bearer = authorization?.match(/^Bearer ([A-Za-z0-9_-]+)$/i)?.[1];
      if (authorization && !bearer) fail(401, 'unauthorized', 'The Authorization header is invalid.');
      const cookie = request.headers.get('cookie')?.split(';').map((s) => s.trim()).find((s) => s.startsWith('crops_session='))?.slice(14);
      // A webhook URL carries its access key in the path; keys never come from cookies.
      const token = hookMatch ? hookMatch[1] || bearer : bearer || cookie;
      const keyAuth = Boolean(hookMatch || bearer) && isAccessKey(token);
      if (hookMatch) {
        if (request.method !== 'POST') fail(405, 'method_not_allowed', 'Webhooks accept POST requests.');
        await throttle(db, [[`hook-ip:${context.ip || 'unknown'}`, 600], [`hook-key:${digest(String(token))}`, 120]], 60, 'Too many webhook requests. Please wait a minute and try again.');
        if (!keyAuth) fail(401, 'unauthorized', 'Webhooks require a valid access key in the URL or a Bearer access key.');
      }
      if (!token || token.length > 256) fail(401, 'unauthorized', 'Sign in to continue.');
      if (keyAuth && (/^\/access-keys(\/[^/]+)?$/.test(path) || ['/auth/password', '/auth/logout'].includes(path) || /^\/members\/[^/]+\/password$/.test(path))) fail(403, 'session_required', 'Access keys cannot manage access keys, passwords, or sessions. Sign in to Crops to do this.');
      if (!bearer && !hookMatch && cookie && ['POST', 'PATCH', 'DELETE'].includes(request.method) && !origin && request.headers.get('sec-fetch-site') !== 'same-origin') fail(403, 'origin_required', 'Cookie-authenticated changes require a verified same-origin browser request. Native clients should use a Bearer token.');
      // Record key use at most once a minute, outside the (possibly read-only) request transaction.
      if (keyAuth) await db.query("UPDATE access_keys SET last_used_at=now() WHERE key_hash=$1 AND revoked_at IS NULL AND (last_used_at IS NULL OR last_used_at < now()-interval '1 minute')", [digest(token)]);
      if ((path === '/auth/password' || /^\/members\/[^/]+\/password$/.test(path)) && request.method === 'POST') {
        const session = await one(db, 'SELECT user_id FROM sessions WHERE token_hash=$1 AND expires_at>now()', [digest(token)]);
        await authThrottle(db, context.ip || 'unknown', `password:${session?.user_id || digest(token)}`);
      }
      let stateTag;
      let stateServerTime;
      let stateNotModified = false;
      const result = await db.transaction(async (tx) => {
        if (path === '/state' && request.method === 'GET') await tx.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
        const user = keyAuth
          ? await one(tx, 'SELECT u.*,clock_timestamp() AS server_time FROM users u JOIN access_keys k ON k.user_id=u.id WHERE k.key_hash=$1 AND k.revoked_at IS NULL', [digest(token)])
          : await one(tx, 'SELECT u.*,clock_timestamp() AS server_time FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token_hash=$1 AND s.expires_at > now()', [digest(token)]);
        if (!user) fail(401, 'unauthorized', keyAuth ? 'This access key is invalid or has been revoked.' : 'Your session expired. Please sign in again.');
        // New key secrets are never written to the replay store.
        const requestKey = request.method === 'POST' && !path.startsWith('/auth/') && path !== '/access-keys' ? request.headers.get('idempotency-key') : null;
        if (requestKey !== null) {
          if (!/^[A-Za-z0-9._:-]{8,128}$/.test(requestKey)) fail(400, 'invalid_idempotency_key', 'Idempotency-Key must be 8–128 letters, numbers, periods, underscores, colons, or hyphens.');
          const fingerprint = digest(`${request.method}:${hookMatch ? '/hooks' : path}:${JSON.stringify(Object.fromEntries(Object.entries(body).sort(([a], [b]) => a.localeCompare(b))))}`);
          await tx.query("DELETE FROM mutation_requests WHERE created_at < now()-interval '24 hours'");
          // Concurrent duplicates wait on the unique row until the first transaction commits.
          await tx.query('INSERT INTO mutation_requests(user_id,request_key,fingerprint) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [user.id, requestKey, fingerprint]);
          const saved = await one(tx, 'SELECT * FROM mutation_requests WHERE user_id=$1 AND request_key=$2 FOR UPDATE', [user.id, requestKey]);
          if (saved.fingerprint !== fingerprint) fail(409, 'idempotency_conflict', 'This request key was already used for a different change.');
          if (saved.response !== null) return saved.response;
        }
        const execute = async (method, path, body) => {
        if (path === '/auth/logout' && method === 'POST') {
          await tx.query('DELETE FROM sessions WHERE token_hash=$1', [digest(token)]);
          return { ok: true };
        }
        if (path === '/auth/password' && method === 'POST') {
          const lockedUser = await one(tx, 'SELECT * FROM users WHERE id=$1 FOR NO KEY UPDATE', [user.id]);
          if (!await verifyPassword(password(body.currentPassword, 'Current password'), lockedUser.password_hash)) fail(401, 'invalid_credentials', 'Current password is incorrect.');
          await tx.query('UPDATE users SET password_hash=$1 WHERE id=$2', [await hashPassword(password(body.newPassword, 'New password')), user.id]);
          await tx.query('DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2', [user.id, digest(token)]);
          return { ok: true };
        }
        if (path === '/access-keys' && method === 'GET') return { keys: (await tx.query('SELECT * FROM access_keys WHERE user_id=$1 AND revoked_at IS NULL ORDER BY created_at DESC,id', [user.id])).rows.map(accessKeyJson) };
        if (path === '/access-keys' && method === 'POST') {
          if (Object.keys(body).some((key) => key !== 'name')) fail(400, 'invalid_input', 'Only a key name can be set.');
          const name = string(body.name, 'Key name', { min: 1, max: 100 });
          await tx.query('SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE', [user.id]);
          if ((await one(tx, 'SELECT COUNT(*)::integer AS count FROM access_keys WHERE user_id=$1 AND revoked_at IS NULL', [user.id])).count >= 50) fail(409, 'too_many_keys', 'Revoke an unused access key before creating another. The limit is 50.');
          const { secret, prefix, hash } = createAccessKey();
          const row = await one(tx, 'INSERT INTO access_keys(id,user_id,name,prefix,key_hash) VALUES($1,$2,$3,$4,$5) RETURNING *', [randomUUID(), user.id, name, prefix, hash]);
          return { key: accessKeyJson(row), secret };
        }
        const accessKeyMatch = path.match(/^\/access-keys\/([^/]+)$/);
        if (accessKeyMatch && method === 'DELETE') {
          if (!await one(tx, 'UPDATE access_keys SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL RETURNING id', [accessKeyMatch[1], user.id])) fail(404, 'not_found', 'Access key not found.');
          return { ok: true };
        }
        // Webhooks translate one action into the matching REST route, so every
        // permission, lock, and validation rule is the REST rule.
        if (/^\/hooks(\/[^/]+)?$/.test(path) && method === 'POST') {
          const actions = ['start', 'stop', 'toggle', 'log', 'update', 'delete'];
          if (!actions.includes(body.action)) fail(400, 'invalid_action', `Action must be one of: ${actions.join(', ')}.`);
          const entryId = own(body, 'entryId') ? string(body.entryId, 'Entry ID', { min: 1, max: 80 }) : undefined;
          const running = await one(tx, 'SELECT id FROM entries WHERE user_id=$1 AND started_at IS NOT NULL', [user.id]);
          const action = body.action === 'toggle' ? (running ? 'stop' : 'start') : body.action;
          // Senders pass an IANA timezone so default dates follow their clock, not the server's UTC day.
          const zone = own(body, 'timezone') ? string(body.timezone, 'Timezone', { min: 1, max: 64 }) : null;
          const today = () => { if (!zone) return new Date().toISOString().slice(0, 10); try { return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); } catch { fail(400, 'invalid_input', 'Timezone must be an IANA name such as America/Chicago.'); } };
          const dated = (fields) => own(body, 'date') ? fields : { ...fields, date: today() };
          const withMinutes = (fields) => own(body, 'durationMinutes') && !own(body, 'durationSeconds') ? { ...fields, durationSeconds: Math.round(number(body.durationMinutes, 'Duration minutes', 10080) * 60) } : fields;
          const teamOf = async () => {
            if (own(body, 'teamId')) return body.teamId;
            if (entryId) {
              const entry = await one(tx, 'SELECT team_id FROM entries WHERE id=$1 AND user_id=$2', [entryId, user.id]);
              if (!entry) fail(404, 'not_found', 'Time entry not found.');
              return entry.team_id;
            }
            const project = await one(tx, 'SELECT p.team_id FROM projects p JOIN memberships m ON m.team_id=p.team_id AND m.user_id=$2 WHERE p.id=$1', [string(body.projectId, 'Project ID', { min: 1, max: 80 }), user.id]);
            if (!project) fail(400, 'invalid_project', 'Choose a project in one of your teams.');
            return project.team_id;
          };
          if (action === 'start') return execute('POST', '/timer/start', dated({ ...pick(body, ['projectId', 'task', 'notes', 'billable', 'date', 'agent', 'entryId', 'version']), teamId: await teamOf() }));
          if (action === 'stop') {
            const id = body.action === 'stop' && entryId ? entryId : running?.id;
            return id ? execute('POST', '/timer/stop', { ...pick(body, ['agent', ...(body.action === 'stop' ? ['version'] : [])]), entryId: id }) : { entry: null };
          }
          if (action === 'log') return execute('POST', '/entries', withMinutes({ date: today(), ...pick(body, ['projectId', 'task', 'notes', 'billable', 'date', 'durationSeconds', 'agent']), teamId: await teamOf() }));
          if (!entryId) fail(400, 'invalid_input', 'Provide the entryId to change.');
          // Without a version, lock the entry and use its current version.
          const version = own(body, 'version') ? body.version : (await editableEntry(tx, entryId, user)).row.version;
          if (action === 'delete') return execute('DELETE', `/entries/${entryId}`, { version });
          return execute('PATCH', `/entries/${entryId}`, withMinutes({ ...Object.fromEntries(Object.entries(body).filter(([key]) => !['action', 'entryId', 'durationMinutes', 'timezone'].includes(key))), version }));
        }
        if (path === '/state' && method === 'GET') {
          const teams = (await tx.query('SELECT t.id,t.name,m.role FROM teams t JOIN memberships m ON m.team_id=t.id WHERE m.user_id=$1 ORDER BY t.created_at,t.id', [user.id])).rows;
          const team = url.searchParams.has('teamId') ? teams.find((t) => t.id === url.searchParams.get('teamId')) : teams[0];
          if (!team) fail(403, 'team_access_denied', 'You do not have access to this team.');
          const members = (await tx.query('SELECT m.*,u.name,u.username,(SELECT COUNT(*)::integer FROM memberships all_m WHERE all_m.user_id=m.user_id) AS team_count FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.team_id=$1 ORDER BY u.name,m.id', [team.id])).rows.map((m) => ({ ...memberJson(m), canManageAccount: team.role === 'admin' && m.team_count === 1 }));
          const formerMembers = team.role === 'admin' ? (await tx.query('SELECT DISTINCT u.id,u.name,u.username FROM users u JOIN entries e ON e.user_id=u.id WHERE e.team_id=$1 AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.team_id=$1 AND m.user_id=u.id)', [team.id])).rows.map(publicUser) : [];
          const clients = (await tx.query('SELECT * FROM clients WHERE team_id=$1 ORDER BY name,id', [team.id])).rows.map(clientJson);
          const projects = (await tx.query('SELECT * FROM projects WHERE team_id=$1 ORDER BY name,id', [team.id])).rows.map(projectJson);
          const entries = (await tx.query(`SELECT * FROM entries WHERE team_id=$1${team.role === 'admin' ? '' : ' AND user_id=$2'} ORDER BY date DESC,created_at DESC,id`, team.role === 'admin' ? [team.id] : [team.id, user.id])).rows.map(entryJson);
          const runningEntry = entryJson(await one(tx, 'SELECT * FROM entries WHERE user_id=$1 AND started_at IS NOT NULL', [user.id]));
          const snapshot = { user: publicUser(user), teams, team, members, formerMembers, clients, projects, entries, runningEntry };
          // This compares application state, excluding the changing clock field,
          // so it is a semantic (weak) validator rather than a byte validator.
          const snapshotHash = digest(JSON.stringify(snapshot));
          stateTag = `W/"${snapshotHash}"`;
          stateServerTime = iso(user.server_time);
          // Netlify can append -df when it compresses a response. Match only
          // that documented variant of this exact hash, never a substring.
          stateNotModified = (request.headers.get('if-none-match') || '').split(',').some((tag) => {
            const candidate = tag.trim().replace(/^W\//, '');
            return candidate === `"${snapshotHash}"` || candidate === `"${snapshotHash}-df"`;
          });
          return stateNotModified ? null : { ...snapshot, serverTime: stateServerTime };
        }
        if (path === '/teams' && method === 'POST') {
          await tx.query('SELECT id FROM app_locks WHERE id=1 FOR UPDATE');
          return { team: await createTeam(tx, user.id, string(body.name, 'Team name', { min: 1, max: 100 })) };
        }
        const teamMatch = path.match(/^\/teams\/([^/]+)$/);
        if (teamMatch && method === 'PATCH') {
          await tx.query('SELECT id FROM teams WHERE id=$1 FOR NO KEY UPDATE', [teamMatch[1]]);
          await membership(tx, teamMatch[1], user.id, true);
          if (Object.keys(body).some((key) => key !== 'name')) fail(400, 'invalid_input', 'Only the team name can be changed.');
          return { team: await one(tx, 'UPDATE teams SET name=$1 WHERE id=$2 RETURNING id,name', [string(body.name, 'Team name', { min: 1, max: 100 }), teamMatch[1]]) };
        }
        if (path === '/timer/start' && method === 'POST') {
          const teamId = string(body.teamId, 'Team ID', { min: 1, max: 80 });
          await membership(tx, teamId, user.id);
          // NO KEY UPDATE serializes timers while remaining compatible with the
          // FK KEY SHARE locks held by concurrent idempotency/session inserts.
          await tx.query('SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE', [user.id]);
          await membership(tx, teamId, user.id); // Removal may have completed while this timer waited.
          const usage = own(body, 'agent') ? agent(body.agent) : undefined;
          let entry;
          if (body.entryId) {
            entry = await one(tx, 'SELECT * FROM entries WHERE id=$1 AND user_id=$2 AND team_id=$3 FOR UPDATE', [body.entryId, user.id, teamId]);
            if (!entry) fail(404, 'not_found', 'Time entry not found.');
            if (entry.status !== 'unbilled') fail(409, 'entry_locked', 'Invoiced or paid time cannot be restarted.');
            checkVersion(body.version, entry, true);
            await validProject(tx, entry.project_id, teamId);
            if (entry.started_at) return { entry: entryJson(usage === undefined || JSON.stringify(agentJson(entry)) === JSON.stringify(usage) ? entry : await one(tx, 'UPDATE entries SET agent_tokens=$2,agent_cost=$3,agent_model=$4,version=version+1 WHERE id=$1 RETURNING *', [entry.id, ...agentValues(usage)])) };
          }
          const project = await validProject(tx, entry?.project_id || body.projectId, teamId);
          const running = await one(tx, 'SELECT * FROM entries WHERE user_id=$1 AND started_at IS NOT NULL FOR UPDATE', [user.id]);
          if (running) await stopEntry(tx, running);
          if (entry) entry = await one(tx, `UPDATE entries SET started_at=clock_timestamp()${usage === undefined ? '' : ',agent_tokens=$2,agent_cost=$3,agent_model=$4'},version=version+1 WHERE id=$1 RETURNING *`, [entry.id, ...(usage === undefined ? [] : agentValues(usage))]);
          else entry = await one(tx, 'INSERT INTO entries(id,team_id,user_id,project_id,task,notes,date,billable,started_at,agent_tokens,agent_cost,agent_model) VALUES($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp(),$9,$10,$11) RETURNING *', [randomUUID(), teamId, user.id, project.id, string(body.task, 'Task', { max: 200, fallback: '' }), string(body.notes, 'Notes', { max: 4000, fallback: '' }), date(body.date || new Date().toISOString().slice(0, 10)), bool(body.billable, 'Billable', project.billable), ...agentValues(usage)]);
          return { entry: entryJson(entry) };
        }
        if (path === '/timer/stop' && method === 'POST') {
          const { row } = await editableEntry(tx, string(body.entryId, 'Entry ID', { min: 1, max: 80 }), user);
          if (row.user_id !== user.id) fail(403, 'entry_access_denied', 'You can only stop your own timer.');
          checkVersion(body.version, row, true);
          return { entry: entryJson(await stopEntry(tx, row, own(body, 'agent') ? agent(body.agent) : undefined)) };
        }
        if (path === '/entries' && method === 'POST') {
          const teamId = string(body.teamId, 'Team ID', { min: 1, max: 80 });
          const member = await membership(tx, teamId, user.id);
          const userId = own(body, 'userId') ? string(body.userId, 'User ID', { min: 1, max: 80 }) : user.id;
          if (userId !== user.id && member.role !== 'admin') fail(403, 'admin_required', 'An admin is required to enter another member’s time.');
          await membership(tx, teamId, userId);
          const project = await validProject(tx, body.projectId, teamId);
          const entry = await one(tx, 'INSERT INTO entries(id,team_id,user_id,project_id,task,notes,date,duration_seconds,billable,agent_tokens,agent_cost,agent_model) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *', [randomUUID(), teamId, userId, project.id, string(body.task, 'Task', { max: 200, fallback: '' }), string(body.notes, 'Notes', { max: 4000, fallback: '' }), date(body.date), number(body.durationSeconds, 'Duration', 604800, true), bool(body.billable, 'Billable', project.billable), ...agentValues(own(body, 'agent') ? agent(body.agent) : null)]);
          return { entry: entryJson(entry) };
        }
        const entryMatch = path.match(/^\/entries\/([^/]+)$/);
        if (entryMatch && ['PATCH', 'DELETE'].includes(method)) {
          const { row, member } = await editableEntry(tx, entryMatch[1], user);
          checkVersion(body.version ?? (url.searchParams.has('version') ? Number(url.searchParams.get('version')) : undefined), row);
          if (method === 'DELETE') {
            if (row.started_at || row.status !== 'unbilled') fail(409, 'entry_locked', 'Stop this timer and mark it unbilled before deleting.');
            await tx.query('DELETE FROM entries WHERE id=$1', [row.id]);
            return { ok: true };
          }
          const keys = Object.keys(body).filter((key) => key !== 'version');
          const allowed = ['task', 'notes', 'date', 'durationSeconds', 'projectId', 'billable', 'status', 'agent'];
          if (!keys.length || keys.some((key) => !allowed.includes(key))) fail(400, 'invalid_input', 'Provide valid editable entry fields.');
          if (own(body, 'status') && member.role !== 'admin') fail(403, 'admin_required', 'Only team admins can change billing status.');
          if (row.status !== 'unbilled' && !(keys.length === 1 && keys[0] === 'status' && member.role === 'admin')) fail(409, 'entry_locked', 'This entry is locked. An admin must first mark it unbilled.');
          if (row.started_at && keys.some((key) => ['date', 'durationSeconds', 'status'].includes(key))) fail(409, 'timer_running', 'Stop this timer before changing its duration, date, or billing status.');
          const changes = {};
          if (own(body, 'task')) changes.task = string(body.task, 'Task', { max: 200 });
          if (own(body, 'notes')) changes.notes = string(body.notes, 'Notes', { max: 4000 });
          if (own(body, 'date')) changes.date = date(body.date);
          if (own(body, 'durationSeconds')) changes.duration_seconds = number(body.durationSeconds, 'Duration', 604800, true);
          if (own(body, 'projectId')) changes.project_id = (await validProject(tx, body.projectId, row.team_id)).id;
          if (own(body, 'billable')) changes.billable = bool(body.billable, 'Billable');
          if (own(body, 'agent')) [changes.agent_tokens, changes.agent_cost, changes.agent_model] = agentValues(agent(body.agent));
          if (own(body, 'status')) {
            if (!['unbilled', 'invoiced', 'paid'].includes(body.status)) fail(400, 'invalid_input', 'Billing status must be unbilled, invoiced, or paid.');
            if (body.status !== 'unbilled' && !(changes.billable ?? row.billable)) fail(400, 'not_billable', 'Nonbillable time cannot be marked invoiced or paid.');
            changes.status = body.status;
          }
          const fields = Object.keys(changes);
          const updated = await one(tx, `UPDATE entries SET ${fields.map((field, i) => `${field}=$${i + 1}`).join(',')},version=version+1 WHERE id=$${fields.length + 1} RETURNING *`, [...Object.values(changes), row.id]);
          return { entry: entryJson(updated) };
        }
        const entityMatch = path.match(/^\/(clients|projects)(?:\/([^/]+))?$/);
        if (entityMatch && ['POST', 'PATCH'].includes(method)) {
          const [, table, id] = entityMatch;
          if ((method === 'POST' && id) || (method === 'PATCH' && !id)) fail(404, 'not_found', 'Endpoint not found.');
          const previous = id ? await one(tx, `SELECT * FROM ${table} WHERE id=$1 FOR UPDATE`, [id]) : null;
          if (id && !previous) fail(404, 'not_found', 'Item not found.');
          const teamId = previous?.team_id || string(body.teamId, 'Team ID', { min: 1, max: 80 });
          await membership(tx, teamId, user.id, true);
          const values = { name: own(body, 'name') || !id ? string(body.name, 'Name', { min: 1, max: 160 }) : previous.name, archived: own(body, 'archived') ? bool(body.archived, 'Archived') : previous?.archived || false };
          if (table === 'clients') values.email = own(body, 'email') || !id ? string(body.email, 'Email', { max: 254, fallback: '' }) : previous.email;
          else {
            values.client_id = own(body, 'clientId') || !id ? await validClient(tx, body.clientId ?? null, teamId) : previous.client_id;
            values.code = own(body, 'code') || !id ? string(body.code, 'Code', { max: 40, fallback: '' }) : previous.code;
            values.color = own(body, 'color') || !id ? string(body.color, 'Color', { fallback: '#C56845', max: 7 }) : previous.color;
            if (!/^#[0-9a-f]{6}$/i.test(values.color)) fail(400, 'invalid_input', 'Color must be a six-digit CSS hex color.');
            values.billable = own(body, 'billable') || !id ? bool(body.billable, 'Billable', true) : previous.billable;
            values.rate = own(body, 'rate') || !id ? number(body.rate ?? 0, 'Hourly rate') : previous.rate;
            values.budget_hours = own(body, 'budgetHours') || !id ? number(body.budgetHours ?? 0, 'Budget hours') : previous.budget_hours;
            if (id && values.archived && await one(tx, 'SELECT id FROM entries WHERE project_id=$1 AND started_at IS NOT NULL', [id])) fail(409, 'timer_running', 'Stop all timers on this project before archiving it.');
          }
          const fields = Object.keys(values);
          let row;
          if (id) row = await one(tx, `UPDATE ${table} SET ${fields.map((field, i) => `${field}=$${i + 1}`).join(',')} WHERE id=$${fields.length + 1} RETURNING *`, [...Object.values(values), id]);
          else row = await one(tx, `INSERT INTO ${table}(id,team_id,${fields.join(',')}) VALUES($1,$2,${fields.map((_, i) => `$${i + 3}`).join(',')}) RETURNING *`, [randomUUID(), teamId, ...Object.values(values)]);
          return table === 'clients' ? { client: clientJson(row) } : { project: projectJson(row) };
        }
        if (path === '/members' && method === 'POST') {
          await tx.query('SELECT id FROM app_locks WHERE id=1 FOR UPDATE');
          const teamId = string(body.teamId, 'Team ID', { min: 1, max: 80 });
          await membership(tx, teamId, user.id, true);
          const account = username(body.username);
          let addedUser = await one(tx, 'SELECT * FROM users WHERE username=$1', [account]);
          if (!addedUser) addedUser = await one(tx, 'INSERT INTO users(id,username,name,password_hash) VALUES($1,$2,$3,$4) RETURNING *', [randomUUID(), account, string(body.name, 'Name', { min: 1, max: 100 }), await hashPassword(password(body.password))]);
          const member = await one(tx, 'INSERT INTO memberships(id,team_id,user_id,role) VALUES($1,$2,$3,$4) RETURNING *', [randomUUID(), teamId, addedUser.id, role(body.role)]);
          return { member: memberJson({ ...member, name: addedUser.name, username: addedUser.username }) };
        }
        const memberMatch = path.match(/^\/members\/([^/]+)(\/password)?$/);
        if (memberMatch && ((!memberMatch[2] && ['PATCH', 'DELETE'].includes(method)) || (memberMatch[2] && method === 'POST'))) {
          // Account-wide changes must serialize with invitations and team creation.
          await tx.query('SELECT id FROM app_locks WHERE id=1 FOR UPDATE');
          const previous = await one(tx, 'SELECT * FROM memberships WHERE id=$1', [memberMatch[1]]);
          if (!previous) fail(404, 'not_found', 'Team member not found.');
          await tx.query('SELECT id FROM teams WHERE id=$1 FOR NO KEY UPDATE', [previous.team_id]);
          await membership(tx, previous.team_id, user.id, true);
          const target = await one(tx, 'SELECT * FROM users WHERE id=$1 FOR NO KEY UPDATE', [previous.user_id]);
          const accounts = await one(tx, 'SELECT COUNT(*)::integer AS count FROM memberships WHERE user_id=$1', [target.id]);
          const exclusiveAccount = () => {
            if (accounts.count !== 1) fail(409, 'shared_account', 'Shared accounts cannot be renamed or have passwords reset by a team admin.');
          };
          if (memberMatch[2]) {
            if (target.id === user.id) fail(400, 'own_password', 'Use Change password in Settings for your own account.');
            exclusiveAccount();
            const actor = await one(tx, 'SELECT password_hash FROM users WHERE id=$1', [user.id]);
            if (!await verifyPassword(password(body.currentPassword, 'Your current password'), actor.password_hash)) fail(401, 'invalid_credentials', 'Your current password is incorrect.');
            await tx.query('UPDATE users SET password_hash=$1 WHERE id=$2', [await hashPassword(password(body.newPassword, 'New password')), target.id]);
            await tx.query('DELETE FROM sessions WHERE user_id=$1', [target.id]);
            await tx.query('UPDATE access_keys SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [target.id]);
            return { ok: true };
          }
          const removing = method === 'DELETE';
          if (!removing && (!Object.keys(body).length || Object.keys(body).some((key) => !['role', 'name'].includes(key)))) fail(400, 'invalid_input', 'Only name and role can be changed here.');
          const nextRole = removing ? 'member' : own(body, 'role') ? role(body.role) : previous.role;
          if (previous.role === 'admin' && nextRole === 'member') {
            const count = await one(tx, "SELECT COUNT(*)::integer AS count FROM memberships WHERE team_id=$1 AND role='admin'", [previous.team_id]);
            if (count.count < 2) fail(409, 'last_admin', 'A team must keep at least one admin.');
          }
          if (removing) {
            const running = await one(tx, 'SELECT * FROM entries WHERE user_id=$1 AND team_id=$2 AND started_at IS NOT NULL FOR UPDATE', [target.id, previous.team_id]);
            if (running) await stopEntry(tx, running);
            await tx.query('DELETE FROM memberships WHERE id=$1', [previous.id]);
            return { ok: true };
          }
          if (own(body, 'name')) {
            exclusiveAccount();
            await tx.query('UPDATE users SET name=$1 WHERE id=$2', [string(body.name, 'Name', { min: 1, max: 100 }), target.id]);
          }
          await tx.query('UPDATE memberships SET role=$1 WHERE id=$2', [nextRole, previous.id]);
          const updated = await one(tx, 'SELECT m.*,u.name,u.username FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.id=$1', [previous.id]);
          return { member: memberJson(updated) };
        }
        fail(404, 'not_found', 'Endpoint not found.');
        };
        const payload = await execute(request.method, path, body);
        if (requestKey !== null) await tx.query('UPDATE mutation_requests SET response=$1 WHERE user_id=$2 AND request_key=$3', [JSON.stringify(payload), user.id, requestKey]);
        return payload;
      });
      const stateHeaders = stateTag ? { ETag: stateTag, 'X-Crops-Server-Time': stateServerTime, Date: new Date(stateServerTime).toUTCString() } : {};
      if (stateNotModified) return new Response(null, { status: 304, headers: { ...headers, ...stateHeaders } });
      return respond(result, request.method === 'POST' && (['/teams', '/entries', '/clients', '/projects', '/members', '/access-keys'].includes(path) || (hookMatch && body.action === 'log')) ? 201 : 200, path === '/auth/logout' ? { 'Set-Cookie': sessionCookie('', productionEnvironment(env) || url.protocol === 'https:') } : stateHeaders);
    } catch (error) {
      if (error instanceof ApiError) return respond({ error: error.message, code: error.code }, error.status, error.status === 429 ? { 'Retry-After': String(error.retryAfter || 900) } : {});
      if (error.code === '23505') return respond({ error: 'This username or team membership already exists. Refresh and try again.', code: 'already_exists' }, 409);
      if (error.code === '23503' || error.code === '23514') return respond({ error: 'This change conflicts with related data. Refresh and try again.', code: 'data_conflict' }, 409);
      if (error.code === '40P01' || error.code === '40001') return respond({ error: 'Another device changed this data. Please try again.', code: 'concurrent_update' }, 409);
      if (error.code === '57014' || error.code === '55P03') return respond({ error: 'The database is busy. Please try again shortly.', code: 'database_busy' }, 503);
      console.error('Crops API request failed:', error.code || error.name);
      return respond({ error: 'Crops could not complete this request. Please try again.', code: 'server_error' }, 500);
    }
  };
}

export const handleRequest = createApi();
