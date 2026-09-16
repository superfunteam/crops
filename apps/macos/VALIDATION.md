# Native macOS validation

Initial native checks completed locally on September 15, 2026 using Apple Swift 6.0.3 and Command Line Tools (without full Xcode). Domain migration checks and both architecture rebuilds completed on September 16, 2026.

## Built artifacts

- `artifacts/Crops.app`: native universal Mach-O with **arm64 and x86_64** slices; macOS 13 minimum.
- `artifacts/Crops-macOS.zip`: **766,409 bytes** compressed; the app is approximately **3 MB** installed.
- A matching ZIP is included at `web/public/downloads/Crops-macOS.zip`.
- `codesign --verify --deep --strict artifacts/Crops.app` passed. Signature is ad hoc, not Developer ID/notarized.

## Automated checks passed

- `swift run --package-path apps/macos CropsCoreTests`: **38 checks** covering absolute elapsed time through sleep, clock correction, CDN clock-header fallback, nonnegative timing, duration parsing/bounds, formatting, server URL security, and production-origin migration while preserving custom/local servers.
- `CropsCheck` against isolated PostgreSQL-compatible local API storage: login, full state decoding, conditional state refresh (ETag/304), manual entry persistence, repeated-key duplicate prevention, start, elapsed persistence, stop, resume, stale-stop rejection after a remote resume, and logout.
- Both native architecture builds succeeded. Runtime checks were on the current Apple Silicon Mac; the Intel slice was cross-compiled and packaged, not run on an Intel Mac.

The portable test executable is intentional: Apple's standalone Command Line Tools do not include XCTest. No third-party test/runtime dependency was added.

## Native UI checks completed

Used the actual packaged app with an isolated local QA account and a separate API at port 8788. Shared demo fixtures were not modified.

- Launch and inspect the native login view.
- Sign in to the local API through the app; verify stored projects and entries appear.
- Start a timer through the app; independently verify that same timer through the API.
- Stop that timer through a separate API session; observe the native app return to its start form through polling.
- Add 15 minutes through the native manual-entry form; verify it appears in daily totals.
- Resume the manual entry through its play button; verify the running timer begins with its saved 15 minutes, then stop through the app.
- Switch to a second team and verify its own General project and empty timesheet appear.
- Quit and relaunch the final universal binary; confirm the Keychain session restores without re-entering credentials.
- Shut down the isolated API and sync; confirm a visible connection error and preserved last-known entries. Restart the API and confirm recovery to “All changes saved.”
- Sign out and confirm return to login. Remove the isolated QA session and restore the normal local-development server preference.

The app creates its native menu-bar status window and the companion window; the above interaction checks use the companion window. Direct menu-bar popover interaction, actual Mac sleep/wake, automatic startup at login, Gatekeeper download handling, and production HTTPS deployment were not exercised. The timer's sleep behavior is checked with absolute-time calculations, and wake/focus notifications are implemented.

## Distribution note

Repeated ad-hoc development rebuilds have different code signatures. macOS may prompt before a changed development binary can access a previous binary's Keychain item; sign out before replacing an ad-hoc build. Stable Developer ID signing is recommended when distributing updates to the team. The same final binary's restart/session persistence passed.

## Deployment configuration

The packaged app defaults fresh installs to `https://crops.wims.vc`. The exact previous production origin migrates to this address on upgrade; its old Keychain entry and remembered team selection are cleared, so a fresh sign-in may be required. Existing custom/local server preferences remain in effect, and the login form still accepts another HTTPS origin or a loopback development server. Both architectures were rebuilt and all 38 core checks passed after the domain change.

Hosted native API smoke previously passed against the original Netlify origin using a disposable workspace. A native login/timer test has not been repeated against `https://crops.wims.vc`; current custom-domain DNS, TLS, and API health results are tracked by the deployment checks.

## Version 1.1.0 — timer-first interface

- Universal arm64/x86_64 build and strict ad hoc signature verification passed.
- 43 core checks passed, including menu-label states for signed-out, loading, idle, running with seconds, and failed sync while the elapsed timer continues.
- Actual native UI checks used a separate app identifier and disposable local workspace on port 8791. The default home has no entry form; New entry opens it, Back dismisses it, and successful timer/manual entry submissions return to the timesheet. A five-minute manual entry appeared correctly. Start and Stop controls updated the active timer panel.
- Closing the last window initially terminated the test app. An explicit application delegate now keeps it resident; the same process ID remained after closing the window and switching to Finder. Reopening retained the current timer state. Explicit Quit still exited.
- The clock runs in common run-loop modes so menu interaction does not suspend its tick. Menu-bar presentation is covered by the native state checks above; the UI automation's window screenshots do not include the system status bar.
