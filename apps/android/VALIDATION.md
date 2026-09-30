# Android 1.3.0 verification

Verified on September 30, 2026 with Java 17, Android SDK 36, and a fresh Pixel 7 / Android 15 (API 35) emulator. The test API used a temporary local PGlite database on port 8793; production data was not used.

- `:app:assembleDebug`, `:app:assembleDebugAndroidTest`, and `:app:lintDebug` passed. Lint reported no errors and four existing warnings.
- `verify-device.sh http://10.0.2.2:8793` passed **65 checks**. Coverage includes page crossfades and their settled state, unchanged polling/clock ticks, system-disabled animations and preference restoration, the compact idle overview, opening/canceling/reopening the new timer form, preserved drafts, keyboard resize with the full Start action visible, confirmed Start, encrypted session persistence, timer notification and Stop action, stale-version protection, manual entry/edit/delete, mixed time and agent usage, token-only presentation and editor, resume, and background cross-device start/stop.
- Visual review confirmed rounded cream forms with large native inputs/project pickers, full-row billable controls, and chunky primary actions. The form still appears only after Start. With the keyboard open, the fields scroll while Start/Cancel remain visible.

The debug APK is `app/build/outputs/apk/debug/app-debug.apk`, with version name **1.3.0** and version code **5**. It remains signed for internal sideloading.
