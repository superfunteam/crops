# Crops

**Simple team time tracking. One timer, everywhere.**

A native macOS menu-bar app, a tiny native Android app with a live timer notification, and a responsive web workspace. Clients share one authenticated API and one PostgreSQL data model. No invoicing subscription, attachments service, or web wrapper inside the native apps.

## Live workspace

Open **https://crops.wims.vc**. The web app and API run on Netlify with its native PostgreSQL database. Both native apps default to this address and use the same account. Public sign-ups are closed; an administrator adds teammates from the Team page.

Install the latest native downloads to move an existing installation from the previous production address automatically. Sign in again after updating; custom and local server settings are preserved.

## Run locally

```sh
npm install
CROPS_SEED_DEMO=true npm run dev
```

Open **http://localhost:5173**. The optional local sample workspace uses:

- Username: `demo`
- Password: `crops-demo-2026`

Sample names and time entries are illustrative. The supplied Harvest screenshots remain untouched in the root folder.

For a clean workspace, run `npm run dev` without the seed flag and choose **Create a workspace**. Data persists in `.data/crops`. Seeding only applies to an empty development database; it never runs in production. To keep a separate clean development workspace, use `CROPS_DATA_DIR=.data/my-team npm run dev`.

### Native apps

| App | Ready-to-run artifact | Connect to local API |
| --- | --- | --- |
| macOS 13+ (Apple silicon + Intel) | [Universal ZIP](web/public/downloads/Crops-macOS.zip) | `http://127.0.0.1:8787` |
| Android 8+ | [Crops-android.apk](web/public/downloads/Crops-android.apk) | Emulator: `http://10.0.2.2:8787` |

Open `artifacts/Crops.app` on Mac. Install the Android APK by opening it on your device, or run `adb install -r artifacts/Crops-android.apk`. USB Android testing can use `adb reverse tcp:8787 tcp:8787`, then `http://127.0.0.1:8787` in the app. Both apps accept the same username/password as the web workspace.

For a physical device on Wi-Fi, start the server with `HOST=0.0.0.0 npm run dev`, and use your Mac’s LAN IP with port 8787. This exposes the development API to your local network. Use HTTPS and the deployed web origin for production.

These artifacts are **internal test builds**: macOS is ad hoc signed and not notarized; Android uses a debug signing key. Rebuild with your own distribution certificates before a team-wide production rollout. Native build and signing instructions are in [macOS](apps/macos/README.md) and [Android](apps/android/README.md).

## What works

- Username/password accounts, secure sessions, password changes, multiple teams, admin/member permissions, team renaming, member editing/removal, and admin password resets for accounts exclusive to the team.
- Clients, projects, project codes/colors, hourly rates, hour budgets, archiving/restoring.
- One running timer per person across all teams and devices. Starting another timer stops the previous one atomically.
- Start, stop, resume, manual time, notes/tasks, daily and weekly timesheets.
- Team reporting with dates, people, project and billing-status filters; CSV export.
- Mark billable time unbilled, invoiced, or paid. Invoiced/paid entries are locked until an admin explicitly marks them unbilled.
- Native macOS menu-bar timer with keyboard shortcuts, daily window and Keychain session storage.
- Native Android foreground notification with elapsed chronometer and Stop action; optional background discovery of timers started elsewhere; Keystore session storage.
- Personal access keys from Settings for scripts, integrations, and agents. Keys act with their owner's current permissions, are stored only as hashes, and can be revoked at any time.
- Inbound webhooks (`POST /api/hooks/<key>`) to start, stop, toggle, log, edit, and delete time from Zapier, iOS Shortcuts, Stream Deck, CI, or Claude Code hooks; see [docs/API.md](docs/API.md#webhooks).
- Agents: time entries carry agent-reported token usage and USD cost, billed on top of hours × rate. A zero-dependency MCP server (`npm run mcp`) and Claude Code hooks let an agent start/stop/resume timers, log time, list, edit, and delete entries, and report its usage; see [docs/MCP.md](docs/MCP.md).
- Server-clock correction, stale-edit conflict protection, conditional sync requests, persistent duplicate-request protection, and visible connection failures.

Billing amounts use **current project rates in USD**, not historical invoice snapshots. Invoice documents, payments, and bank integrations stay with your existing bank.

## Architecture

```text
React + Vite web ───────────┐
SwiftUI macOS ──────────────┼── /api ── Netlify Function ── PostgreSQL
Android platform Views ────┘

Local development: same API + SQL, using filesystem-persisted PGlite.
```

- The native apps depend only on OS frameworks. Android is roughly 75 KB; the universal Mac ZIP is under 1 MB.
- Web JavaScript is approximately 86 KB gzip, CSS 8 KB gzip, plus the self-hosted Inter font. Native downloads are separate.
- Production uses native Netlify Database with branch-aware connections and `pg` transactions. Netlify applies SQL migrations during deployment. Local PGlite needs no Docker or database account. Production refuses to fall back to filesystem storage.
- No external font, analytics, advertising, or image requests are needed by the web UI.

### Sync behavior

Timers are timestamps on the server, not a local counter. Closing an app or sleeping the device does not stop a running timer. Clients refresh after writes and on foreground/wake; running native clients check about every 5 seconds, idle native clients about every 15 seconds. The web checks while visible and refreshes when reopened. Unchanged snapshots return HTTP 304 with a fresh server clock, so time history is not downloaded repeatedly.

Connectivity and Android power management can delay remote changes. Android’s optional **Live cross-device sync** keeps a quiet foreground notification visible so it can discover remote starts while backgrounded. Reopen after reboot or force-stop. This is polling-based synchronization, not a push guarantee.

Offline changes are not silently queued. A visible error asks the user to reconnect/refresh when a write cannot be confirmed. Duplicate-request keys prevent a replayed request from adding time twice. Server permissions and entry versions protect team boundaries and concurrent edits.

## Development and verification

```sh
npm run dev                 # Web :5173 + API :8787
npm test                    # API and web-domain/transport regressions
npm run build               # TypeScript check + production web bundle
netlify build --offline     # Web + real Netlify function packaging
npm run build:macos         # Universal .app and ZIP
npm run build:android       # Android debug APK
```

See [verification notes](docs/VALIDATION.md), [API contract](docs/API.md), and [security/operations notes](docs/OPERATIONS.md).

## Deploy on Netlify

See the [deployment guide](docs/DEPLOYMENT.md). Source lives in [superfunteam/crops](https://github.com/superfunteam/crops); pushing to `main` builds and publishes the `crops-superfun` site on the `clarklab` Netlify account. Direct operator deployments can use `netlify deploy --prod --context production`. Keep `CROPS_ALLOW_REGISTRATION=false`; admins add teammates in the web app. Native database credentials stay on the server and are resolved per deployment.

## Structure

```text
web/                 React management and tracking UI
server/              Shared API, auth, persistence, development server
db/                  PostgreSQL schema
netlify/functions/   Netlify API entry point
netlify/database/    Deployment-managed SQL migrations
apps/macos/          SwiftUI app, universal build script and checks
apps/android/        Native Android project, APK and device checks
scripts/             Local process runner and owner bootstrap
artifacts/           Built apps and validation artifacts (ignored by Git)
web/public/downloads/ Native test builds served by the web app
```

## Open-source dependencies

React, Vite, TypeScript, Lucide, node-postgres and PGlite handle the web and data plumbing; Inter is self-hosted under its font license. See [third-party notices](docs/THIRD_PARTY.md). There are no third-party runtime libraries in either native app.
