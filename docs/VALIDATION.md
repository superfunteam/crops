# Crops verification

Verified on September 15–16, 2026 on Apple silicon macOS, plus an Android 15 emulator and a real hosted Netlify deployment.

## Automated checks

- `npm test`: 35 total, 34 passed; the separate real-PostgreSQL integration test is skipped unless `CROPS_TEST_DATABASE_URL` is supplied.
- Backend suite with isolated PostgreSQL 18.6 and `TZ=Asia/Tokyo`: 23/23 passed. Covers authentication, secure session storage, cross-team permissions, concurrent timers, last-admin protection, idempotent writes, stale edits, billing locks, persistent throttling, and durable restart.
- After the Netlify Database adapter and deployment migration were added, its dedicated PostgreSQL test passed again. It verifies four connection pools, consistent state snapshots, SQL DATE timezone handling, RLS denial for an unprivileged role, no runtime schema creation in native mode, and private owner setup without a session.
- Seven web checks cover lossless seconds, manual durations, timers after suspension, calendar/DST arithmetic, network retries reusing the same request key, conditional state caching with fresh server time, and CDN-generated 304 clock fallback.
- TypeScript, Vite production build, and Netlify function packaging passed. Unused TypeScript imports/parameters were checked separately.

## Native apps

- macOS: universal arm64/x86_64 build, ad hoc signature verified, 38 core checks passed, including production-origin migration and preservation of custom/local settings. Native API integration covers login, HTTP 304, idempotent manual time, start/stop/resume, stale-stop protection and logout. Actual Apple silicon UI testing covered menu-bar/window interaction, remote changes, manual time, team switching, offline feedback, restart and Keychain sessions. Intel was cross-compiled, not runtime tested.
- Android: debug and release compile, lint has zero errors, APK v2 signature verified. Actual Android 15 emulator instrumentation passed 21 checks, including a stale notification unable to stop a resumed timer. GUI testing covered tracking and the foreground chronometer. A separate hosted smoke run passed 21 checks over production HTTPS, including timer advancement across multiple proxy 304 responses, notification Stop, background remote start/stop, and Keystore logout cleanup. The custom-domain build passed 10 migration checks and 5 actual upgrade checks using the previous published APK, including fresh-install defaults, old-session cleanup, and preservation of custom/local settings. The signing certificate is unchanged.

Details: [macOS](../apps/macos/VALIDATION.md), [Android](../apps/android/VERIFICATION.md).

## Web interaction checks

Actual browser testing covered sign-in, creating clients/projects, budgets/rates, manual time, note editing without losing seconds, remote timer stop synchronization, invoiced/paid status and locked entries. Editing a project whose client was archived was tested explicitly.

Desktop and 390×844 mobile layouts were inspected. Mobile time and billing pages have no horizontal page overflow. Navigation closes accessibly on mobile. Editors are cleared when the account or workspace changes, and late state responses cannot replace a newly selected workspace.

## Production checks

The deployment's canonical URL is https://crops.wims.vc. Native Netlify Database is provisioned, all four deployment migrations are applied, the owner workspace is usable, and `/api/health` returns `storage: netlify-postgres` with registration disabled. Hosted native downloads return the correct MIME types and exactly match local SHA-256 hashes:

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Universal Mac ZIP | 766409 | `1ee5c0ecdd3ae4524580f53e080bebb054f52b2e62b2cc139969fc38f984b9ee` |
| Android APK | 42961 | `1539ae84f710b01365722db0aba2562faeb22cbec9b75421a3554b8a34bdc06a` |

Custom-domain deployment `6aaac4eb9a1c8ea973c98c60` was verified on September 16. The web page, API health, and both downloads returned HTTPS 200 with valid certificates and the expected MIME types. Public Google and Cloudflare DNS resolve the domain; checks used `curl --resolve` with that public address because this Mac's resolver still had a cached negative answer. The native upgrade checks cover the domain change; the full hosted timer flows above were exercised before the domain change.

## Practical limits

These checks do not establish app-store readiness, performance with years of large-team history, or background-delivery guarantees on every Android vendor. macOS distribution is not notarized; Android downloads use debug signing. Sync is polling-based and requires connectivity. See [operations](OPERATIONS.md) for scope and maintenance.
