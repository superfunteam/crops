# Crops API

The web, macOS menu bar, and Android apps share `/api`. Development runs on `http://localhost:8787`; production runs at `https://crops.wims.vc/api`, on the same origin as the web app. JSON request and response keys use camelCase. Requests that mutate data use `Content-Type: application/json`.

## Authentication

- `POST /auth/register` `{username,password,name,teamName}` → `{token,user}`. Creates an admin and a team, with an Internal client / General project ready to track. Usernames are case-insensitive, 3–80 characters; passwords are 8–128 characters.
- `POST /auth/login` `{username,password}` → `{token,user}`.
- `POST /auth/logout` → `{ok:true}`. Revokes this session.
- Send `Authorization: Bearer <token>`. Web may instead use the HttpOnly, SameSite=Lax session cookie. Sessions expire after 30 days. Native apps should store the token in OS-protected credential storage.
- Scripts, integrations, and agents should use a personal **access key** instead of a password or session: `Authorization: Bearer crops_…`. See [Access keys](#access-keys).
- Cookie-authenticated writes must supply a permitted `Origin`, or the browser-controlled `Sec-Fetch-Site: same-origin` header. Malformed Authorization headers never fall back to a cookie. Native Bearer requests do not require Origin.
- `GET /health` returns `{ok,storage,registrationEnabled,serverTime}`. `storage` is `pglite`, `postgres`, or `netlify-postgres` in normal environments. `registrationEnabled` lets clients hide public signup when it is closed. Health never creates demo accounts.

## Access keys

Access keys let programs act as a user without that user's password. Create them in **Settings → Access keys** or with the API below. A key is `crops_` followed by 43 URL-safe random characters. Crops stores only its SHA-256 hash, so the secret is shown once, at creation.

- `GET /access-keys` → `{keys:[{id,name,prefix,createdAt,lastUsedAt}]}`. Active (unrevoked) keys for the signed-in user, newest first. `prefix` is the first 12 characters, for recognizing a key; the secret is never returned again.
- `POST /access-keys` `{name}` → 201 `{key:{id,name,prefix,createdAt,lastUsedAt},secret}`. Name is 1–100 characters. At most 50 active keys per user (409 `too_many_keys`). This route ignores `Idempotency-Key`, so secrets never enter the replay store; a retried request can create a second key, which you can revoke.
- `DELETE /access-keys/:id` → `{ok:true}`. Revokes one of your own keys immediately. Unknown, already revoked, or another user's key returns 404.

Send a key as `Authorization: Bearer crops_…` on any other endpoint. It authenticates as its owner with exactly that user's current permissions: team access, admin rules, and entry locks are checked on every request from current memberships, so removing someone from a team removes that access for their keys too. Keys are never read from cookies and need no `Origin` header. Keys do not expire; `lastUsedAt` is updated at most once a minute. Revoked or unknown keys return 401.

Managing keys, changing passwords (`/auth/password`, `/members/:id/password`), and `/auth/logout` require a signed-in session. With an access key they return 403 `session_required`, so a leaked key cannot mint more keys or lock the owner out. Changing your own password keeps your keys; revoke keys you no longer use. An admin password reset for a teammate revokes all of that teammate's sessions **and** access keys.

## Webhooks

`POST /hooks/:key` accepts one action from tools that can only POST to a URL, such as Zapier, iOS Shortcuts, Stream Deck, CI jobs, or Claude Code hooks. **The URL contains the access key, so treat it like a password.** Senders that can set headers may instead `POST /hooks` with `Authorization: Bearer crops_…`. Session tokens and cookies are not accepted here.

The body is a JSON object with an `action`. The content type does not need to be `application/json`. Each action runs the matching REST route inside one transaction, with the same validation, permissions, locks, and response JSON:

| `action` | Fields | Same as |
| --- | --- | --- |
| `start` | `projectId`, `task?`, `notes?`, `billable?`, `date?`, `agent?`; or `entryId` to resume your own entry | `POST /timer/start` → `{entry}` |
| `stop` | `entryId?`, `agent?` | `POST /timer/stop` → `{entry}`. Without `entryId` it stops your running timer, or returns `{entry:null}` if none is running. |
| `toggle` | as `start` | Stops your running timer (any project) if one runs; otherwise starts. → `{entry}` |
| `log` | `projectId`, `durationSeconds` or `durationMinutes`, `date?`, `task?`, `notes?`, `billable?`, `agent?` | `POST /entries` → 201 `{entry}` |
| `update` | `entryId`, `version?`, and any of `task`, `notes`, `date`, `durationSeconds`/`durationMinutes`, `projectId`, `billable`, `status`, `agent` | `PATCH /entries/:id` → `{entry}` |
| `delete` | `entryId`, `version?` | `DELETE /entries/:id` → `{ok:true}` |

The team is taken from the project (or entry), which must belong to one of your teams; an explicit `teamId` is also accepted. `date` defaults to today in the optional `timezone` you send (an IANA name such as `America/Chicago`), otherwise the server's UTC date. Send `timezone` or `date` so evening entries don't land on tomorrow. For `update` and `delete`, `version` is optional: without it Crops locks the entry and uses its current version (last write wins). Send `version` to get 409 `version_conflict` protection. The REST `PATCH`/`DELETE` routes still require a version. `Idempotency-Key` works as for other POSTs. Webhooks are rate limited to 120 requests per minute per key and 600 per minute per source IP (429 with `Retry-After`). Unknown actions return 400 `invalid_action`.

```sh
# Toggle a timer from a Stream Deck button or a shortcut
curl -X POST "https://crops.wims.vc/api/hooks/$CROPS_ACCESS_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"action":"toggle","projectId":"project-uuid","task":"Focus","timezone":"America/Chicago"}'

# Log 30 minutes from CI, with the key in a header instead of the URL
curl -X POST https://crops.wims.vc/api/hooks \
  -H "Authorization: Bearer $CROPS_ACCESS_KEY" -H 'Content-Type: application/json' \
  -d '{"action":"log","projectId":"project-uuid","durationMinutes":30,"task":"Deploy"}'

# Fix the notes on an entry without looking up its version
curl -X POST "https://crops.wims.vc/api/hooks/$CROPS_ACCESS_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"action":"update","entryId":"entry-uuid","notes":"Client call"}'
```

## Shared state / synchronization

`GET /state?teamId=<optional>` returns:

```json
{
  "user": {"id":"uuid","name":"Alex","username":"alex"},
  "teams": [{"id":"uuid","name":"Studio","role":"admin","canManageAccount":true}],
  "formerMembers": [],
  "team": {"id":"uuid","name":"Studio","role":"admin"},
  "members": [{"id":"uuid","userId":"uuid","name":"Alex","username":"alex","role":"admin","canManageAccount":true}],
  "formerMembers": [],
  "clients": [{"id":"uuid","teamId":"uuid","name":"Internal","email":"","archived":false}],
  "projects": [{"id":"uuid","teamId":"uuid","clientId":"uuid","name":"General","code":"","color":"#C56845","billable":true,"rate":0,"budgetHours":0,"archived":false}],
  "entries": [{"id":"uuid","teamId":"uuid","userId":"uuid","projectId":"uuid","task":"Design","notes":"","date":"2026-09-15","durationSeconds":3600,"startedAt":null,"billable":true,"status":"unbilled","agent":{"tokens":2410000,"cost":31.4,"model":"claude-opus-5"},"version":1}],
  "runningEntry": null,
  "serverTime": "2026-09-15T16:00:00.000Z"
}
```

`durationSeconds` is accumulated **completed** time. While running, display that plus seconds since `startedAt`, using `serverTime` to correct clock drift. There is at most one running timer per user across all teams. `runningEntry` reports that timer even when a different team is selected. State returns all team entries for admins and only the current user's entries for members. A state response uses one repeatable database snapshot, so its entry list and running timer agree even during concurrent changes. For admins, `canManageAccount` marks accounts exclusive to this team, and `formerMembers` supplies names for historical entries after membership removal. Refetch after every mutation; poll every 5 seconds while active and immediately on foreground/focus. No offline mutation is silently accepted.

`GET /state` returns a weak `ETag` for the application state, excluding its changing clock field. Cache the snapshot per authenticated account and full request path, then send `If-None-Match` with subsequent requests. Unchanged data returns **304 with no body**, the current ETag, and `X-Crops-Server-Time` containing the database clock in ISO format. Reuse the cached snapshot and update the clock offset from that header. If an intermediary removes that custom header, use the standard response `Date` header (whole-second precision). The API also accepts Netlify's documented `-df` compressed variant of the exact same ETag hash, so compression does not force a full origin response. Clear cached snapshots on login/logout. Timer ticking does not change the ETag; local elapsed-time calculation continues. Every state response remains `Cache-Control: no-store`; this is explicit application caching, not a browser/shared cache.

Polling is eventual synchronization, typically within five seconds when active. ETags reduce network payload but each poll still invokes the function and reads the database. One continuously visible device polling every five seconds makes about 5,760 requests in an eight-hour workday. State currently reads all accessible history; large multi-year teams may need date pagination or an incremental change feed. Background polling frequency is controlled by each client.

## Safe mutation retries

Authenticated **POST** mutations outside `/auth/*` accept an `Idempotency-Key` header (a UUID is recommended; 8–128 allowed characters). Generate one key for a user action and reuse it only when retrying that same method, endpoint, and JSON payload. Keys are scoped to the authenticated user, persisted for 24 hours, and committed atomically with the mutation. Concurrent duplicate requests replay one original successful result. A different payload with the same key returns 409 `idempotency_conflict`. Failed transactions do not reserve the key.

A replay returns the original response, which can now be stale: for example, replaying a successful timer start after it was stopped returns that original entry but **does not restart it**. Always refetch state after a successful response or an uncertain network result. After the 24-hour window, refetch and reconcile before any retry. PATCH/DELETE entry retries rely on their version checks; they do not use this replay store.

## Timer and timesheets

- `POST /timer/start` `{teamId,projectId,task,notes,billable,entryId?,agent?}` → `{entry}`. Creates a timer or resumes an existing own unbilled entry. Atomically stops any previous running timer first. Starting the already-running entry is idempotent. Optional `date` is an ISO calendar date; it defaults to the server's current UTC date.
- `POST /timer/stop` `{entryId,agent?}` → `{entry}`. Stops an own timer; repeated stops are idempotent. Optional `version` enables stale-update checks. `agent` attaches usage while stopping (for example from an agent's Stop hook); repeating the recorded usage is a no-op, and invoiced/paid entries reject a change with 409 `entry_locked`.
- `POST /entries` `{teamId,projectId,task,notes,date,durationSeconds,billable,agent?}` → `{entry}`. Duration must be a whole number from 0 through 604800 seconds (one week). Admin may include `userId` to enter time for a team member.
- `PATCH /entries/:id` `{version,task?,notes?,date?,durationSeconds?,projectId?,billable?,status?,agent?}` → `{entry}`. Required version must match current state. Members edit only their own unbilled time. Admins may change billing status: `unbilled`, `invoiced`, or `paid`. Invoiced/paid time is locked; to change details, an admin must first send a separate status-only update to `unbilled`. Running entries must be stopped before changing duration, date, or billing status.
- `DELETE /entries/:id?version=N` → `{ok:true}`. Version may instead be supplied in a JSON body. Only stopped unbilled entries can be deleted.

### Agent usage

Entries carry optional agent-reported usage: `agent` is `null` or `{tokens,cost,model}`. The agent computes its own numbers; Crops does not meter anything. `tokens` is a whole number from 0 through 1,000,000,000,000. `cost` is a nonnegative USD amount with at most two decimal places (up to 1,000,000). `model` is optional (at most 100 characters; empty or omitted is stored as `null`). Unknown keys, strings for numbers, or partial objects return 400 `invalid_input`. Sending `agent` replaces the recorded usage; `agent:null` clears it. PATCH changes follow the same version, member, and billing-lock rules as other entry fields, and usage can be updated while a timer runs. Billable entries are valued at hours × current project rate **plus** `agent.cost` in reports, billing totals, and CSV export (which also includes agent token and cost columns). See [MCP.md](MCP.md) for the agent MCP server and hooks.

## Teams / management

- `POST /teams` `{name}` → `{team}`. Creates a team with the caller as admin and a General project.
- `PATCH /teams/:id` `{name}` → `{team}`. Admin renames the team (1–100 characters).
- `POST /clients` `{teamId,name,email?,archived?}` → `{client}`.
- `PATCH /clients/:id` `{name?,email?,archived?}` → `{client}`.
- `POST /projects` `{teamId,clientId?,name,code?,color?,billable?,rate?,budgetHours?}` → `{project}`. `rate` is a nonnegative currency amount per hour; `budgetHours` is nonnegative hours. Color is six-digit CSS hex.
- `PATCH /projects/:id` allows project fields above and `archived`. Projects with a running timer cannot be archived.
- `POST /members` `{teamId,username,name?,password?,role?}` → `{member}`. Admin adds an existing username to this team, or creates a new user (name and password required). Existing account credentials are never changed by joining a team. Role is `member` (default) or `admin`.
- `PATCH /members/:id` `{role?,name?}` → `{member}`. Admin edits a member. Names can be changed only for accounts exclusive to this team. The last admin cannot be demoted.
- `DELETE /members/:id` → `{ok:true}`. Admin revokes membership and stops any timer in this team. Recorded time and billing history remain. The last admin cannot be removed.
- `POST /members/:id/password` `{currentPassword,newPassword}` → `{ok:true}`. Admin resets another member’s password after verifying the admin’s own current password. Only accounts exclusive to this team are eligible. All target sessions are revoked; running timers are preserved. This route is rate limited. Use Settings for your own password.
- `POST /auth/password` `{currentPassword,newPassword}` → `{ok:true}`. Changes the caller's password and revokes every other session.

Clients, projects, members, and billing status require team admin access. Cross-team IDs are rejected. Archived projects cannot receive new time. Data is retained when clients/projects are archived.

## Errors

Non-2xx responses are `{error:"Human-readable message",code:"machine_code"}`. Common statuses: 400 invalid input, 401 expired/missing credentials or a revoked access key, 403 insufficient access (or `session_required` for an access key), 404 missing object, 409 stale version / locked time / conflicting state, 429 sign-in or webhook rate limited, 503 database unconfigured. Never treat an unsuccessful server response as a successful local mutation.

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

### Copyable agent instructions

Settings → Agent usage tracking generates a prompt or downloadable `crops-token-skill.md` for the current team, selected client/project, and reporting trigger (push to main, session end, completed task, PR update, or manual request). Preferences are saved per user/team in the current browser; copy the prompt again after changing them. This is an instruction generator, not an installed runtime hook.

The agent supplies `CROPS_ACCESS_KEY` privately and posts to `/api/hooks` with Bearer authentication. Reports use `action: log` and zero duration, preserving human hours and active timers. Non-billable is the default; users can explicitly include reported cost in billing. Instructions report tokens alongside observed subscription caps, reset windows, and remaining capacity. Cost is the work’s allocated slice of the actual subscription fee using the simple 160-hour monthly estimate—not API token pricing. Unknown plan/cap data is labeled unknown; missing cost-allocation inputs keep reports pending. Agents keep a ledger of known allocations and flag incomplete cross-agent coverage; Crops does not enforce a subscription-wide allocation cap. Instructions distinguish measured usage from estimates and explain Crops’ 24-hour idempotency retention. No plan prices or secrets are embedded in the generated prompt.

The prompt builder asks only for an optional monthly subscription price. It estimates each slice as monthly price × attributable active agent hours / 160, using calendar months and labeling the 160-hour basis as an allocation convention rather than a provider cap. It asks only for the monthly price if missing, detects model/vendor when possible, and reports unknown capacity data without blocking. Old saved fee values migrate to the price field. Access keys remain separate and private.

Agent timesheet rows show one `Agent Usage: tokens · price` pill and use `task` as the short work title beneath it. Long work summaries and reporting metadata stay in `notes` (4,000 characters), accessible through the Agent details editor and exports. Legacy `Agent usage:` task prefixes are removed for display only; stored history is unchanged.
