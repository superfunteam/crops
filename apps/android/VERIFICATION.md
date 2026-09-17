# Android verification — 2026-09-16

## Build and package

- Version `1.1.0` (version code `3`) adds entry editing, deletion, and the agent usage label.
- Clean `./gradlew clean` then `bash build-apk.sh` (`:app:assembleDebug :app:lintDebug`): **BUILD SUCCESSFUL**, Android lint **0 errors / 4 warnings** — the same four as 1.0.1: pinned Gradle version, legacy backup configuration, and two English-only UI string warnings. Backups are disabled.
- `:app:assembleDebugAndroidTest` and `:app:assembleRelease` (R8 minification and resource shrinking, unsigned): successful.
- `apksigner verify --verbose`: debug APK verifies with APK Signature Scheme v2. Signing-certificate SHA-256 `18e87aef297d389dfae90a1b88cfc4f93ff48cb759d8b48023ab9e1e27139831`, unchanged from 1.0.0/1.0.1, so it installs over them.
- Application ID `com.crops.time`, min SDK 26, target/compile SDK 36.
- Distributable debug APK: **52,925 bytes**, SHA-256 `d450dd4b9775f40c04e65375330449da78025c0e083f35e0923e493b12cd954f`. No third-party runtime dependencies.
- Identical copies in `artifacts/Crops-android.apk` and `web/public/downloads/Crops-android.apk`.

## Runtime

Installed and launched on a Pixel 7 profile using the Android 15 / API 35 arm64 emulator. The instrumentation suite ran against an isolated, empty real PGlite API (`server/dev.mjs` on port 8790, reached as `http://10.0.2.2:8790`) with `./verify-device.sh`. Its full result is in `verification-device.txt`. It was run on a build from the same source as the distributed APK; the distributed APK was then rebuilt clean.

All **41 checks** passed (21 existing plus 20 for editing). The existing checks cover native registration, username/password login, Android Keystore session reload and encrypted storage, the actual native Start button, service creation, visible live chronometer, displayed Stop control, stale native Stop and retained old notification after a remote stop-and-resume, current notification Stop, manual 90-minute time entry, same-entry resume and accumulated duration, persistent idle service, remote start and stop while the activity is backgrounded, and logout credential removal.

### Editing and deletion

- Native edit dialog opens from the entry's labelled Edit button, is prefilled (duration `1:30`), and Save persists a real `PATCH` through Android's `HttpURLConnection` — task, notes, and a 2:15 duration — bumping the version by exactly one and leaving the date unchanged (only changed fields are sent). The dialog closes after the confirmed save.
- A PATCH and a DELETE with a stale version each receive 409 `This entry changed on another device`, leave the server data intact, refetch state, and return the visible error.
- A running entry: the server rejects a duration change (409 `timer_running`); the native dialog disables duration/date and hides Delete; a task rename persists while the timer keeps running.
- Native Delete shows a confirmation dialog without sending anything; confirming removes the entry.
- Agent usage set through the API arrives in state and the entry card shows `2.41M tokens · $31.40`. Label parsing ignores `agent:null`, a missing or string `agent`, and string numbers, and formats `999999` as `1M tokens` and `$1,234.50`.

A manual visual pass on the emulator (signed in to the same local API) confirmed the timesheet card with the agent pill and 48dp Resume/Edit buttons, the Edit dialog (Delete in red, Cancel, Save changes, agent model line), and the read-only invoiced dialog with its lock reason and only a Close button. TalkBack itself was not exercised; content descriptions were checked through the view hierarchy.

The stale-action checks retain the original UI button and notification PendingIntent, stop and resume the same entry through another API client, then invoke those old controls. Both receive a version conflict and leave the resumed timer running. The refreshed notification successfully stops it.

The background test found and fixed an idle-to-active polling cadence issue. The service now switches immediately to the 5-second cadence when it discovers a running timer. Conditional state requests and server-time headers were exercised against the updated API.

Before the canonical-domain change, all **21 hosted smoke checks** passed against the deployed Netlify API. They covered native login, timer start, a timer advancing by more than 15 seconds across multiple 304 polls, notification Stop, remote timer synchronization while backgrounded, and logout/session revocation. A 304 response uses the HTTP Date header when the proxy omits the custom server-time header. The hosted result is preserved in `verification-hosted.txt`. Native authenticated timer checks have not been repeated against the new custom domain.

### Production default

The fresh-install Workspace URL defaults to `https://crops.wims.vc`. Upgrading a saved exact previous production origin migrates to this domain, clears that origin's credential and cached team/state, and requires a fresh login. Custom servers, local servers, and existing canonical-domain sessions remain unchanged. The legacy URL literal remains only in the compatibility migration constant.

All **10 offline migration checks** passed on the emulator, including saved-origin matching, credential/cache clearing, preservation of custom/local sessions, and the actual editable canonical URL field. Results: `verification-migration.txt`. Screenshot: `artifacts/android-production-default.png`.

All **5 package-upgrade checks** also passed: the previously deployed version `1.0.0` was installed, preferences were seeded with its saved production origin, and version `1.0.1` was installed directly over it without clearing app data. Launch migrated the origin and stale state while retaining an unrelated preference. The visible native login field showed the canonical URL. Results: `verification-upgrade.txt`.

## Visual review

Real emulator screenshots were inspected for clipping, readable controls, and navigation:

- `artifacts/android-timer.png` — ready timer and project/task form.
- `artifacts/android-running.png` — running timer and current-day entries.
- `artifacts/android-timesheet.png` — dated timesheet, totals, and resume controls.
- `artifacts/android-notification.png` — Android live chronometer and Stop action.

Physical-device behavior and vendor-specific battery restrictions have not been tested. Open Crops after reboot or force-stop to restore notification monitoring. Production distribution requires an owned release signing key; the provided debug-signed APK is ready for internal installation.
