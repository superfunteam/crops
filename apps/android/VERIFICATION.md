# Android verification — 2026-09-16

## Build and package

- Clean `:app:assembleDebug :app:lintDebug :app:assembleDebugAndroidTest`: successful build and Android lint, **0 errors / 4 warnings**. Warnings concern the pinned Gradle version, legacy backup configuration, and English-only UI strings. Backups are disabled.
- `./gradlew :app:assembleRelease`: successful R8 minification and resource shrinking; the release APK is unsigned.
- `apksigner verify --verbose`: debug APK verifies with APK Signature Scheme v2.
- Application ID: `com.crops.time`, version `1.0.1` (version code `2`), min SDK 26, target/compile SDK 36.
- Distributable debug APK: **42,961 bytes**. No third-party runtime dependencies. The clean build removed unused ZIP padding present in the prior incremental APK; signing and debug build type are unchanged.
- SHA-256: `1539ae84f710b01365722db0aba2562faeb22cbec9b75421a3554b8a34bdc06a`.
- Signing-certificate SHA-256: `18e87aef297d389dfae90a1b88cfc4f93ff48cb759d8b48023ab9e1e27139831`, identical to the previously deployed version `1.0.0` APK.
- Identical copies in `artifacts/Crops-android.apk` and `web/public/downloads/Crops-android.apk`.

## Runtime

Installed and launched on a Pixel 7 profile using the Android 15 / API 35 arm64 emulator. The instrumentation suite runs against an isolated real PGlite API on port 8789. Its full result is in `verification-device.txt`.

All 21 checks passed, covering native registration, username/password login, Android Keystore session reload and encrypted storage, the actual native Start button, service creation, visible live chronometer, displayed Stop control, stale native Stop and retained old notification after a remote stop-and-resume, current notification Stop, manual 90-minute time entry, same-entry resume and accumulated duration, persistent idle service, remote start and stop while the activity is backgrounded, and logout credential removal.

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
