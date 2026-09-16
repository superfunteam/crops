# Crops API

The web, macOS menu bar, and Android apps share `/api`. Development runs on `http://localhost:8787`; production runs at `https://crops.wims.vc/api`, on the same origin as the web app. JSON request and response keys use camelCase. Requests that mutate data use `Content-Type: application/json`.

## Authentication

- `POST /auth/register` `{username,password,name,teamName}` → `{token,user}`. Creates an admin and a team, with an Internal client / General project ready to track. Usernames are case-insensitive, 3–80 characters; passwords are 8–128 characters.
- `POST /auth/login` `{username,password}` → `{token,user}`.
- `POST /auth/logout` → `{ok:true}`. Revokes this session.
- Send `Authorization: Bearer <token>`. Web may instead use the HttpOnly, SameSite=Lax session cookie. Sessions expire after 30 days. Native apps should store the token in OS-protected credential storage.
- Cookie-authenticated writes must supply a permitted `Origin`, or the browser-controlled `Sec-Fetch-Site: same-origin` header. Malformed Authorization headers never fall back to a cookie. Native Bearer requests do not require Origin.
- `GET /health` returns `{ok,storage,registrationEnabled,serverTime}`. `storage` is `pglite`, `postgres`, or `netlify-postgres` in normal environments. `registrationEnabled` lets clients hide public signup when it is closed. Health never creates demo accounts.

## Shared state / synchronization

`GET /state?teamId=<optional>` returns:

```json
{
  "user": {"id":"uuid","name":"Alex","username":"alex"},
  "teams": [{"id":"uuid","name":"Studio","role":"admin"}],
  "team": {"id":"uuid","name":"Studio","role":"admin"},
  "members": [{"id":"uuid","userId":"uuid","name":"Alex","username":"alex","role":"admin"}],
  "clients": [{"id":"uuid","teamId":"uuid","name":"Internal","email":"","archived":false}],
  "projects": [{"id":"uuid","teamId":"uuid","clientId":"uuid","name":"General","code":"","color":"#C56845","billable":true,"rate":0,"budgetHours":0,"archived":false}],
  "entries": [{"id":"uuid","teamId":"uuid","userId":"uuid","projectId":"uuid","task":"Design","notes":"","date":"2026-09-15","durationSeconds":3600,"startedAt":null,"billable":true,"status":"unbilled","version":1}],
  "runningEntry": null,
  "serverTime": "2026-09-15T16:00:00.000Z"
}
```

`durationSeconds` is accumulated **completed** time. While running, display that plus seconds since `startedAt`, using `serverTime` to correct clock drift. There is at most one running timer per user across all teams. `runningEntry` reports that timer even when a different team is selected. State returns all team entries for admins and only the current user's entries for members. A state response uses one repeatable database snapshot, so its entry list and running timer agree even during concurrent changes. Refetch after every mutation; poll every 5 seconds while active and immediately on foreground/focus. No offline mutation is silently accepted.

`GET /state` returns a weak `ETag` for the application state, excluding its changing clock field. Cache the snapshot per authenticated account and full request path, then send `If-None-Match` with subsequent requests. Unchanged data returns **304 with no body**, the current ETag, and `X-Crops-Server-Time` containing the database clock in ISO format. Reuse the cached snapshot and update the clock offset from that header. If an intermediary removes that custom header, use the standard response `Date` header (whole-second precision). The API also accepts Netlify's documented `-df` compressed variant of the exact same ETag hash, so compression does not force a full origin response. Clear cached snapshots on login/logout. Timer ticking does not change the ETag; local elapsed-time calculation continues. Every state response remains `Cache-Control: no-store`; this is explicit application caching, not a browser/shared cache.

Polling is eventual synchronization, typically within five seconds when active. ETags reduce network payload but each poll still invokes the function and reads the database. One continuously visible device polling every five seconds makes about 5,760 requests in an eight-hour workday. State currently reads all accessible history; large multi-year teams may need date pagination or an incremental change feed. Background polling frequency is controlled by each client.

## Safe mutation retries

Authenticated **POST** mutations outside `/auth/*` accept an `Idempotency-Key` header (a UUID is recommended; 8–128 allowed characters). Generate one key for a user action and reuse it only when retrying that same method, endpoint, and JSON payload. Keys are scoped to the authenticated user, persisted for 24 hours, and committed atomically with the mutation. Concurrent duplicate requests replay one original successful result. A different payload with the same key returns 409 `idempotency_conflict`. Failed transactions do not reserve the key.

A replay returns the original response, which can now be stale: for example, replaying a successful timer start after it was stopped returns that original entry but **does not restart it**. Always refetch state after a successful response or an uncertain network result. After the 24-hour window, refetch and reconcile before any retry. PATCH/DELETE entry retries rely on their version checks; they do not use this replay store.

## Timer and timesheets

- `POST /timer/start` `{teamId,projectId,task,notes,billable,entryId?}` → `{entry}`. Creates a timer or resumes an existing own unbilled entry. Atomically stops any previous running timer first. Starting the already-running entry is idempotent. Optional `date` is an ISO calendar date; it defaults to the server's current UTC date.
- `POST /timer/stop` `{entryId}` → `{entry}`. Stops an own timer; repeated stops are idempotent. Optional `version` enables stale-update checks.
- `POST /entries` `{teamId,projectId,task,notes,date,durationSeconds,billable}` → `{entry}`. Duration must be a whole number from 0 through 604800 seconds (one week). Admin may include `userId` to enter time for a team member.
- `PATCH /entries/:id` `{version,task?,notes?,date?,durationSeconds?,projectId?,billable?,status?}` → `{entry}`. Required version must match current state. Members edit only their own unbilled time. Admins may change billing status: `unbilled`, `invoiced`, or `paid`. Invoiced/paid time is locked; to change details, an admin must first send a separate status-only update to `unbilled`. Running entries must be stopped before changing duration, date, or billing status.
- `DELETE /entries/:id?version=N` → `{ok:true}`. Version may instead be supplied in a JSON body. Only stopped unbilled entries can be deleted.

## Teams / management

- `POST /teams` `{name}` → `{team}`. Creates a team with the caller as admin and a General project.
- `POST /clients` `{teamId,name,email?,archived?}` → `{client}`.
- `PATCH /clients/:id` `{name?,email?,archived?}` → `{client}`.
- `POST /projects` `{teamId,clientId?,name,code?,color?,billable?,rate?,budgetHours?}` → `{project}`. `rate` is a nonnegative currency amount per hour; `budgetHours` is nonnegative hours. Color is six-digit CSS hex.
- `PATCH /projects/:id` allows project fields above and `archived`. Projects with a running timer cannot be archived.
- `POST /members` `{teamId,username,name?,password?,role?}` → `{member}`. Admin adds an existing username to this team, or creates a new user (name and password required). Existing account credentials are never changed by joining a team. Role is `member` (default) or `admin`.
- `PATCH /members/:id` `{role}` → `{member}`. Admin role changes; the last admin cannot be demoted. Password changes are deliberately not an admin operation, since an account may belong to other teams.
- `POST /auth/password` `{currentPassword,newPassword}` → `{ok:true}`. Changes the caller's password and revokes every other session.

Clients, projects, members, and billing status require team admin access. Cross-team IDs are rejected. Archived projects cannot receive new time. Data is retained when clients/projects are archived.

## Errors

Non-2xx responses are `{error:"Human-readable message",code:"machine_code"}`. Common statuses: 400 invalid input, 401 expired/missing credentials, 403 insufficient access, 404 missing object, 409 stale version / locked time / conflicting state, 429 login throttled, 503 database unconfigured. Never treat an unsuccessful server response as a successful local mutation.

## Storage and operations

**Native Netlify Database:** the project includes `@netlify/database` and SQL migrations in `netlify/database/migrations/`. Netlify provisions the database and applies pending migrations before publishing. The API resolves its production/preview branch connection through the SDK's `getConnectionString()` and uses the same tested `pg` transaction adapter. Native mode never runs schema DDL at request time. Do not set a fixed production `DATABASE_URL` on the site; that would override automatic preview database isolation. For local owner setup against the native production database, privately set `NETLIFY_DB_URL` to its owner connection string. That key selects native mode and requires the migrations to have been deployed first. See [Netlify connection API](https://docs.netlify.com/build/data-and-storage/netlify-database/api/) and [migration lifecycle](https://docs.netlify.com/build/data-and-storage/netlify-database/migrations/).

**Other PostgreSQL providers:** set `DATABASE_URL` to the provider's pooled TLS connection string (`sslmode=require`). The server applies the idempotent schema in `db/schema.mjs` before requests, coordinated by a PostgreSQL transaction advisory lock across cold starts. Set `CROPS_AUTO_MIGRATE=false` if your own migration pipeline already provisions the schema. Each function instance uses at most three SQL connections, with bounded statement/connection timeouts.

**Local development:** `@electric-sql/pglite` persists data in `.data/crops`; override with `CROPS_DATA_DIR`. Production/Netlify refuses to fall back to local storage when no configured PostgreSQL/native database is available. `CROPS_DATABASE_PROVIDER=netlify` explicitly selects native migration behavior when supplying an external connection override.

Use the database **table owner** account for the API/setup connection. All Crops tables enable PostgreSQL row-level security (RLS) with no direct-client policies; the table owner bypasses RLS and the API enforces user/team permissions. This also prevents Supabase's public Data API roles from reading sensitive tables, even if those roles receive public-schema table grants. Do not expose the owner connection string or a privileged Supabase service-role key to a browser or native app. Crops clients access `/api`, never database tables directly.

`CROPS_ALLOWED_ORIGINS` is an optional comma-separated origin allowlist. Same-origin requests always work; localhost Vite origins are allowed only outside production. **`CROPS_ALLOW_REGISTRATION=false` rejects every public registration, including the first account.** Admins may still create member accounts. For native Netlify Database, link the site and deploy its schema with registration disabled, then run `npm run setup:netlify`. This helper requests the production owner connection from the Netlify API, holds it only in memory, and verifies that its username is `netlifydb_owner`. If Netlify returns only a read-only connection, the helper stops: obtain a writable owner connection from the Netlify database dashboard, set it privately as `NETLIFY_DB_URL`, and run `npm run setup:owner`. A read-only URL cannot bootstrap Crops; changing its username does not grant access. See [Netlify database permissions](https://docs.netlify.com/build/data-and-storage/netlify-database/access-control/).

For another PostgreSQL provider, setup can run before publishing using `DATABASE_URL`. Setup prompts for an owner username, name, team, and masked password; its internal transaction permits exactly one first owner, including if two setup commands run concurrently. It creates no auth session/token. Keep public registration disabled on Netlify, then sign in normally.

The original hosted Crops owner was provisioned through a guarded deployment migration when the Netlify API returned only a read-only operator connection. That migration contains a salted scrypt hash, never a plaintext credential. The owner password was rotated immediately through the authenticated API and the bootstrap password was confirmed invalid. Keep the following retirement migration in deployment history: it preserves the live owner with a changed hash, but removes the unused seed on future fresh installations. Fresh databases therefore have no default account or usable bootstrap password and require normal operator setup. Do not deploy only the bootstrap migration to another installation.

Passwords use scrypt with a random salt, `N=32768, r=8, p=3` (32 MiB), following an [OWASP scrypt profile](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt). Early local-build password hashes are upgraded transparently at successful login. Login/register and password-change throttling is persisted in the database (15 attempts per account and 100 per source IP per 15-minute window). No password reset email or recovery service is included; retain access to an admin account and database backups. Never commit `.data`, connection strings, or session tokens.

Local demo seeding is opt-in: `CROPS_SEED_DEMO=true node server/dev.mjs`. This works only outside production and creates username `demo`, password `crops-demo-2026`. Demo fixtures contain illustrative time, clients, and projects. Production never seeds defaults.

Run local backend tests with `node --test tests/api.test.mjs`. For real PostgreSQL integration, set `CROPS_TEST_DATABASE_URL` to a disposable test database and run `node --test tests/api.test.mjs tests/api-postgres.test.mjs`. Both suites create and remove isolated random schemas when the variable is set. The test role needs CREATE SCHEMA; additional direct-role RLS checks run if CREATE ROLE is available. To exercise timezone behavior, run with `TZ=Asia/Tokyo`.

Project rates are current estimates, not a historical billing ledger. Changing a project's rate changes the displayed value of its past entries; invoiced/paid statuses remain recorded, but no historical invoice amount, invoice number, currency conversion, or immutable financial audit trail is stored. Invoicing remains in the bank.

Implementation references: [PGlite API](https://pglite.dev/docs/api), [Netlify Functions API](https://docs.netlify.com/build/functions/api/), [node-postgres transactions](https://node-postgres.com/features/transactions).
