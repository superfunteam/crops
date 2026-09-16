# Netlify deployment

Crops is linked to **crops-superfun** in the **clarklab** Netlify account.

- Web: https://crops.wims.vc
- Management: https://app.netlify.com/projects/crops-superfun
- Site ID: `f3aed87d-4a99-4121-b5a8-85da8ae3ca0f`
- Storage: native Netlify Database (PostgreSQL).

## Publish updates

The source repository is https://github.com/superfunteam/crops. Netlify builds and publishes the `main` branch when commits are pushed. The build uses `netlify.toml` and includes the prebuilt native downloads committed under `web/public/downloads`.

For a direct operator deployment, with the Netlify CLI signed in:

```sh
npm ci
npm test
netlify deploy --prod --context production --message "Describe the update"
```

The CLI builds the web app and API, applies pending SQL migrations, and publishes. Build settings are in `netlify.toml`: Node 22, `npm run build`, publish `dist`, functions `netlify/functions`.

The native downloads are built on this Mac and included in `web/public/downloads`. Netlify does not cross-compile them. After native source changes, run `npm run build:macos` / `npm run build:android`, copy the resulting artifacts into that download folder, and deploy again. Both apps default to the live HTTPS address; the server remains editable for development.

The September 16 custom-domain builds migrate the exact previous production address to `https://crops.wims.vc` and clear its saved session. Users sign in again after updating. Custom and local server addresses are preserved.

## Database and migrations

`@netlify/database` lets Netlify provision the database and supply the connection for the current deploy. Crops resolves that connection using the SDK and uses `pg` for transactions. Credentials remain on the server.

The initial schema lives in `netlify/database/migrations/20260915210000_create_crops.sql`. Netlify applies migrations before publishing; the API performs no runtime schema changes in native Netlify mode. Add a new ordered SQL migration for future schema changes. Never edit an already-applied migration.

```sh
netlify database status --branch production --json
```

This shows production migration state with credentials redacted. Without `--branch production`, the CLI targets its local development database.

**Do not set a global `DATABASE_URL` on this site.** Native connection resolution keeps deploy previews on their own database branches. `NETLIFY_DB_URL` is supported for private operator tools; never put it in `VITE_*`, client code, or source control.

See [Netlify Database documentation](https://docs.netlify.com/build/data-and-storage/netlify-database/).

## Accounts

Production has `CROPS_ALLOW_REGISTRATION=false`. Public sign-ups are closed; the web login directs new teammates to their administrator. Use **Team → Add teammate** to create a username and initial password. Teammates can change passwords in Settings.

The first owner is created privately, after deploying the empty database and its schema:

```sh
npm run setup:netlify
```

This command captures production database credentials in memory, prompts for an owner name/team/username and masked password, and creates no session. It refuses to run after any account exists. The initial workspace includes an Internal client and General project. No sample accounts or sample time are installed in production.

Some Netlify API sessions return only read-only credentials, including the CLI session used for this deployment. The helper detects this and refuses to continue. A writable connection from the database dashboard can instead be supplied privately as `NETLIFY_DB_URL` to `npm run setup:owner`. Never grant broad RLS access to work around read-only credentials.

This site's initial owner was installed through a guarded data migration with a random temporary password hash. The password is rotated through the app immediately after setup. A retirement migration makes that obsolete seed inert for fresh installations. No plaintext password or session token is present in the migrations.

For another PostgreSQL host, set a private `DATABASE_URL` and use `npm run setup:owner`. That portable mode can apply the idempotent schema at startup; native Netlify mode always uses deployment migrations.

## Verify a deployment

`/api/health` must return `ok: true`, `storage: netlify-postgres`, and `registrationEnabled: false`. Sign in, start a timer on one device, observe it on another, and stop it there. Verify manual time, reports, and invoiced/paid status with a disposable entry.

## Operations and distribution

Manage database usage, backup availability, and recovery in the Netlify account. CSV reports are useful copies of time data; they are not a full database backup. See [operations](OPERATIONS.md) for account recovery and current limits.

The current apps are internal builds: macOS is universal and ad hoc signed, without notarization; Android is debug signed. Use your own Developer ID/notarization and durable Android release key for wider distribution. See the native app READMEs. The site's canonical HTTPS domain is `crops.wims.vc`; no app-store listing is configured.
