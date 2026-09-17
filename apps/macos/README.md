# Crops for macOS

A native SwiftUI menu-bar companion, with a daily timesheet window. Requires macOS 13 or newer. It uses Apple's frameworks only: **no Electron, web runtime, or package dependencies**.

## Build and open

Install Apple's Command Line Tools (`xcode-select --install`), then from the repository root:

```sh
bash apps/macos/build.sh
open artifacts/Crops.app
```

The build script emits universal **Apple Silicon + Intel** `artifacts/Crops.app` and `artifacts/Crops-macOS.zip`. The default artifact is ad-hoc signed for local use. For distribution, set `CROPS_SIGNING_IDENTITY` to your Developer ID Application certificate, then notarize with your Apple account. This local build is not Apple-notarized.

## Connect

Open the app and sign in or create a workspace. Fresh installs connect to **`https://crops.wims.vc`** by default. The server address stays editable: for local development, start the Crops development API and enter `http://127.0.0.1:8787`; for another deployment, enter its **HTTPS origin** without `/api` or a trailing path. Saved custom and local server addresses are preserved. An installation using the previous production origin moves automatically to the new address and removes its old-origin Keychain session; sign in again if prompted. Use the same origin and account on every device. The address is saved in user defaults; session tokens live in **macOS Keychain**, scoped to that server. Passwords are never persisted by the app. Sign out to change servers.

## Everyday use

- The menu bar always shows Crops: a paused `0:00` while idle, a filled play indicator and live `h:mm:ss` while running, and a warning indicator when sync needs attention. Hover for the current project and task. Closing the companion window keeps the app running; **Quit Crops** exits explicitly.
- Click **+ New entry** to choose a project and start a timer. The form opens only after that action; **Back** or Escape returns to the timesheet. A successful start returns to the active timer automatically.
- Stop from the green timer panel. Stop sends the displayed entry version, so an outdated window cannot stop a newer session resumed elsewhere. Resume a stopped unbilled entry using its play button.
- Choose **New entry → Manual time** to add time. Enter `1:30` or `1.5` for 90 minutes. Saving returns to that day's entries.
- Edit an entry with its pencil button, a double-click, or the right-click menu. The edit form matches New entry: project, task, notes, date, duration (`1:30`, `1.5`, or `1:30:15`, up to one week), and billable. Return saves and Escape goes back; unchanged forms simply close. A running timer can change its project, task, notes, and billable flag; stop it first to change its date or duration.
- Saves send only the changed fields with the entry version you opened. If the entry changed on another device, the save is refused, the app refetches, loads the latest details into the form, and shows the error banner so you can review and save again. A notice with **Load latest** also appears if a sync brings a newer version while you edit.
- Invoiced and paid entries show a lock and open read-only with the reason; a team admin can mark them unbilled in the web app.
- Delete your own stopped, unbilled entries from the right-click menu or the edit form (`⌘⌫`). Both ask for confirmation, and deletes carry the displayed version.
- Entries with agent-reported usage show a small label such as `2.41M tokens · $31.40`; the edit form also shows the model.
- Navigate days or weeks below the active timer to review your personal time. Management, team membership, project setup, and invoiced/paid status live in **Open web**.
- Use the team menu to switch workspaces. Your one active timer remains visible across teams.
- Settings includes account information, sync status, sign out, and Quit. The timer keeps running on the server when the window or app closes.
- `⌘N` opens a new entry from the timesheet; `⌘R` syncs; `⌘.` stops a timer; `⇧⌘W` opens management. In the edit form, Return saves, Escape goes back, and `⌘⌫` deletes after confirmation. These shortcuts apply while Crops is active.

## Sync and reliability

Elapsed time is accumulated completed seconds plus the absolute start timestamp, adjusted to the server clock. A suspended Mac doesn't pause the server timer. The app polls every 5 seconds while running and 15 seconds while idle, refetches on wake/focus and after mutations, and serializes user mutations. Conditional requests reuse the current snapshot when nothing changed, reducing network traffic while refreshing server-clock alignment. Stale reads are discarded if a mutation or account/team change supersedes them. HTTP is allowed only on loopback for local development; deployed servers require HTTPS. Redirects are rejected so credentials aren't forwarded to another origin.

Offline reads keep their last state, with a visible warning. New mutations require the server and aren't silently queued. If a response is lost, the app refetches canonical state instead of automatically repeating the write. Retrying that same uncertain change uses its existing idempotency key, allowing the server to return its saved result without creating duplicate time. Entry edits and deletes (PATCH/DELETE) are not replayed by idempotency key; the entry version rejects a stale or repeated change instead, and the app refetches rather than retrying. This version does not provide offline entry creation, a global system-wide shortcut, or automatic login-item registration. To start on login, add Crops under macOS **System Settings → General → Login Items**.

## Validation

```sh
swift run --package-path apps/macos CropsCoreTests
swift build --package-path apps/macos -c release --product CropsCheck
CROPS_SMOKE_URL=http://127.0.0.1:8787 \
  CROPS_SMOKE_USER=your_disposable_test_user \
  CROPS_SMOKE_PASSWORD=your_test_password \
  apps/macos/.build/release/CropsCheck
```

`CropsCheck` exercises the same native API client and Codable models used by the GUI. It requires a disposable account with at least one project and no running timer; it creates a 60-second manual entry with agent usage, edits it, confirms stale edits/deletes are rejected, deletes it, then creates a timer entry and checks running-entry edit limits, start, stop, resume, elapsed persistence, deletion, and logout. It does not automate the GUI. See `VALIDATION.md` for the checks actually completed on the built artifact.
