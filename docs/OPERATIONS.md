# Security and operations

## Boundaries

All permissions are enforced by the API. A member sees and changes their own entries; admins can review team entries, manage projects/clients/members, and reconcile billing. Cross-team IDs are rejected. Starting a timer or editing an entry locks its owning user before changing time, and the database has a unique active-timer constraint. Entry versions reject stale edits.

Passwords use salted scrypt hashes. Sessions are random opaque credentials stored only as hashes in the database, with 30-day expiry and explicit logout. Password changes revoke other sessions. The web uses an HttpOnly SameSite cookie; production cookies are Secure. Cookie mutations require a verified origin; native clients use Bearer authentication. Persistent rate limits cover login, registration and password changes.

macOS keeps tokens in Keychain. Android encrypts them through Keystore and disables backup/device transfer of app data. Native passwords are not persisted. Deployment uses HTTPS and browser security headers. Use a trusted database provider and verified TLS settings. No provider credential enters a native or web client.

## Reliability

- An active timer is an absolute server timestamp plus completed seconds. Clients account for server clock offset.
- Only one timer can run for a user, including across teams. A new start stops the old timer in the same database transaction.
- Stop actions identify an entry, so a stale notification cannot stop a different timer.
- Authenticated POST writes accept persistent idempotency keys, so a repeated request can replay its result without duplicating entries.
- ETags avoid transferring the same state repeatedly. `X-Crops-Server-Time` corrects local clock drift even on HTTP 304 responses.
- The local database is durable; production fails closed without a PostgreSQL connection string.
- Connection failures are visible. There is no offline write queue or silent pretend-success mode.

## Everyday maintenance

Use your PostgreSQL provider’s scheduled backups and recovery tools. Treat `.data/` and `.env` as private. Keep password hashes, session tables and exports out of public repositories. Store distribution signing keys separately from source.

Admin-created teammate accounts use an initial password that should be shared privately and changed by the teammate. The app does not send email, reset links, or notifications to other people. Account recovery currently requires an operator with database access; there is no self-service forgotten-password flow.

All amounts are derived from the current project rate and tracked time, in USD. Changing a rate changes historical *displayed amounts*; recorded time and invoiced/paid status remain. Crops is not an invoice ledger or payment processor. Keep official invoice amounts and receipts in your bank.

## Current limits

- Sync is polling-based; normal active synchronization is measured in seconds, not guaranteed instant push. Android force-stop/reboot, Doze, vendor power management, and lost connectivity may delay notifications.
- Foreground/background activity can consume hosting and database quotas. ETags reduce bandwidth, not the number of API requests. Inspect your provider usage after the first week before relying on a free-tier ceiling.
- State snapshots currently include the accessible team's history. This is suitable for a small internal team; date-window pagination and incremental database queries should be added before very large histories.
- No offline creation/editing, Harvest CSV import, automatic activity detection, idle-time removal, expense tracking, invoice generation, multi-currency ledger, timesheet approval, or project-specific membership ACLs.
- Team admins can add members and change roles; removal/deactivation/account deletion are not yet exposed. Use deliberate operator-level procedures for offboarding until that flow is added.
- App artifacts are internal builds. Signing/notarization and store distribution remain owner-controlled steps.

## Local database safety

Only one development server should use a given PGlite directory. Use a separate `CROPS_DATA_DIR` when running isolated tests. Do not open or modify the live directory from a second process. Automated API tests use temporary databases and clean up their own fixtures.
