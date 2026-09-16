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

- Click the leaf in your menu bar, choose a project, describe your work, and start the timer. The menu bar shows running hours and minutes.
- Stop from the green timer panel. Stop sends the displayed entry version, so an outdated window cannot stop a newer session resumed elsewhere. Resume a stopped unbilled entry using its play button.
- Use **+** beside “What are you working on?” to add manual time. Enter `1:30` or `1.5` for 90 minutes.
- Navigate days or weeks above the timer to review your personal time. Management, team membership, project setup, and invoiced/paid status live in **Open web**.
- Use the team menu to switch workspaces. Your one active timer remains visible across teams.
- Settings includes account information, sync status, sign out, and Quit. The timer keeps running on the server when the window or app closes.
- `⌘R` syncs; `⌘.` stops a timer; `⇧⌘W` opens management.

## Sync and reliability

Elapsed time is accumulated completed seconds plus the absolute start timestamp, adjusted to the server clock. A suspended Mac doesn't pause the server timer. The app polls every 5 seconds while running and 15 seconds while idle, refetches on wake/focus and after mutations, and serializes user mutations. Conditional requests reuse the current snapshot when nothing changed, reducing network traffic while refreshing server-clock alignment. Stale reads are discarded if a mutation or account/team change supersedes them. HTTP is allowed only on loopback for local development; deployed servers require HTTPS. Redirects are rejected so credentials aren't forwarded to another origin.

Offline reads keep their last state, with a visible warning. New mutations require the server and aren't silently queued. If a response is lost, the app refetches canonical state instead of automatically repeating the write. Retrying that same uncertain change uses its existing idempotency key, allowing the server to return its saved result without creating duplicate time. This version does not provide offline entry creation, a global system-wide shortcut, or automatic login-item registration. To start on login, add Crops under macOS **System Settings → General → Login Items**.

## Validation

```sh
swift run --package-path apps/macos CropsCoreTests
swift build --package-path apps/macos -c release --product CropsCheck
CROPS_SMOKE_URL=http://127.0.0.1:8787 \
  CROPS_SMOKE_USER=your_disposable_test_user \
  CROPS_SMOKE_PASSWORD=your_test_password \
  apps/macos/.build/release/CropsCheck
```

`CropsCheck` exercises the same native API client and Codable models used by the GUI. It requires a disposable account with at least one project and no running timer; it creates a 60-second manual entry and a timer entry, then checks start, stop, resume, elapsed persistence, and logout. It does not automate the GUI. See `VALIDATION.md` for the checks actually completed on the built artifact.
