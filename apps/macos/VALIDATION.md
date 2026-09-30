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

## Version 1.2.0 (build 4) — entry editing and deletion

Completed September 16, 2026 with Apple Swift 6.0.3 and Command Line Tools.

- `bash apps/macos/build.sh` succeeded: universal **x86_64 + arm64** binary (`lipo -info`), strict ad hoc `codesign --verify` passed, `artifacts/Crops-macOS.zip` is **990,605 bytes** (~3.9 MB installed). The same ZIP was copied to `web/public/downloads/Crops-macOS.zip`.
- `swift run --package-path apps/macos CropsCoreTests`: **81 checks** passed. New coverage: `h:mm:ss` durations and stricter rejection (`1:30:5`, `-0:30`, full-width digits), one-week and zero bounds for edits, duration text round-trips, date keys, tolerant `agent` decoding (missing, null, malformed, float tokens), web-matching `2.41M tokens · $31.40` labels, PATCH bodies containing only changed fields plus the displayed version, running entries never sending date/duration, locked-entry rejection with reason, delete eligibility, and encoded entry/delete paths.
- `CropsCheck` against an isolated local API (fresh data directory, port 8796, disposable registered account): passed login, conditional state, idempotent manual entry with agent usage decoded from state, PATCH of task/notes/duration (`1:30:15`) with the version, 409 on a stale PATCH and stale DELETE, DELETE with the current version, running-entry task edit (date/duration omitted), 409 on running duration change and running delete, start/stop/resume/stale-stop, deletion of the stopped timer entry, and logout. The API was shut down afterwards.

Not verified: the SwiftUI edit form, row pencil/double-click/context menu, confirmation dialogs, and Return/Escape/`⌘⌫` shortcuts were compiled but not driven interactively in this pass (the UI automation available could not target an ad hoc QA copy of the app). In particular, `⌘⌫` while a text field has focus should be confirmed by hand. The Intel slice was built, not run.

## Version 1.3.0 (build 5) — compact overview and green status badge

Completed September 30, 2026 with Apple Swift 6.0.3 and Command Line Tools.

- Universal arm64 + x86_64 build and strict ad hoc signature verification passed. ZIP: **1,002,829 bytes**, approximately 1 MB. The matching ZIP is included in the public downloads.
- **82 core checks passed**, including idle/signed-out/loading `CROPS` labels, advancing running/offline clocks, and distinguishing token-only entries from entries that also contain human time.
- An isolated QA copy with a separate bundle identifier used a disposable local API on port 8797. The 420 × 520 window showed the compact week calendar, Start timer action, and mixed human/agent entries without an open form. Token-only usage showed **76.2M tokens · $1.66**, without a clock or Resume control; the human entry retained its 0:45 clock and Resume action.
- Start timer opened the form and all fields fit in the window. Escape returned to the overview. A successful start returned to the smaller running card; Stop returned to the idle overview. The QA app, local API, preferences, and local Keychain session were closed/removed after checking.
- Rendered the actual AppKit status-badge code for idle, running, and sync-warning states: forest rounded rectangle, white text, and yellow warning. The final active symbol uses `play.fill` so the triangle remains legible at status-bar size.

Direct system menu-bar interaction, light/dark menu-bar rendering, actual sleep/wake, and Intel runtime were not exercised in this pass. Existing manually resized windows can retain their saved dimensions; the smaller default applies to new windows. The native apps still use ad hoc/internal distribution signing.

## Version 1.4.0 (build 6) — taller forms and view transitions

Completed September 30, 2026. Universal arm64 + x86_64 build and strict ad hoc signature verification passed; **82 core checks passed**. ZIP: **1,107,975 bytes**, approximately 1.1 MB. No runtime dependencies were added.

- Shared embedded-label fields are 58 pt tall; Notes uses a native multiline editor. The project control is a full-height native `NSPopUpButton`, preserving native menus, selected checkmarks, accessibility, and keyboard behavior. Date/duration controls align, the Billable switch has a full-width 50 pt row, and primary actions are 48 pt tall.
- The new-entry Start/Save action stays visible below scrolling fields in a 420 × 520 companion window. The menu-bar panel can expand to 660 pt for forms, limited by the available screen height, then return to its 520 pt overview.
- Actual packaged-app QA used the separate local workspace on port 8797: open/cancel a form; select another project; reselect the current project without resetting Billable; enter multiline Notes with Return without submitting; switch to Manual time; validate duration; save five minutes with multiline notes and the chosen project; return to the overview with the correct daily total; open Settings.
- View transitions are keyed only to navigation, entry-type selection, and active timer identity. Clock ticks, routine polling, and entry versions do not trigger page motion. macOS Reduce Motion disables the custom animations and pressed-button scaling.

The final full-width switch and date-height adjustment were rebuilt after visual QA. Direct menu-bar panel resizing and changing the OS Reduce Motion preference were not driven in this pass; their behavior was reviewed in source and compiled for macOS 13+. Intel was cross-compiled, not run.
