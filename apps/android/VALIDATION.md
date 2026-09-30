# Android 1.2.0 verification

Verified on September 30, 2026 with Java 17, Android SDK 36, and a fresh Pixel 7 / Android 15 (API 35) emulator. The test API used a temporary local PGlite database on port 8789; production data was not used.

- `:app:assembleDebug`, `:app:assembleDebugAndroidTest`, and `:app:lintDebug` passed. Lint reported no errors and four existing warnings.
- `verify-device.sh http://10.0.2.2:8789` passed **51 checks**. Coverage includes the compact idle overview, opening/canceling/reopening the new timer form, preserved drafts, confirmed Start, encrypted session persistence, timer notification and Stop action, stale-version protection, manual entry/edit/delete, mixed time and agent usage, token-only presentation and editor, resume, and background cross-device start/stop.
- Visual review of the idle overview and new timer dialog confirmed that the form appears only after Start, multiline notes are readable, and the primary controls fit on screen.

The debug APK is `app/build/outputs/apk/debug/app-debug.apk`, with version name **1.2.0** and version code **4**. It remains signed for internal sideloading.
