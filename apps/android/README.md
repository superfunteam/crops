# Crops for Android

A native Android app built with Android platform Views and Java 17. There are **zero third-party runtime dependencies** and no WebView. Android 8.0 / API 26 or newer is supported; compile and target SDK are 36.

## Install and connect

The built APK is [`../../artifacts/Crops-android.apk`](../../artifacts/Crops-android.apk). It is signed with the development key for internal sideloading, not a Play Store release.

1. Install with `adb install -r artifacts/Crops-android.apk`, or open the APK on your Android device and allow installation from your file browser.
2. Fresh installs default to **https://crops.wims.vc**. The Workspace URL remains editable for another deployment or local development; enter the origin without `/api`. Version 1.0.1 automatically migrates the previous production address and asks you to sign in again. Custom and local server addresses and their sessions are preserved.
3. Sign in with the same username/password as the web and Mac apps, or create the initial workspace.

For development, run the root API server on port **8787**. An Android emulator can connect to `http://10.0.2.2:8787`. A USB device can use `adb reverse tcp:8787 tcp:8787` and `http://127.0.0.1:8787`. The debug variant permits HTTP for this local workflow; release builds require HTTPS.

## Features

- Username/password login, initial workspace registration, Android Keystore encrypted session tokens, logout.
- Team and project selection; task, notes, billable time; start, stop, and resume entries.
- Today totals, daily timesheet browsing, manual duration entry, invoiced/paid status visibility.
- **Edit and delete time.** Tap an entry (or its labelled Edit button) to open the same form used for manual entry: project, task, notes, date, duration (hours:minutes, same parser), and billable. Save sends `PATCH /api/entries/:id` with the displayed version and only the fields you changed, so seconds under the displayed minute are never overwritten. Running entries can change project, task, notes, and billable; duration and date are disabled until stopped. Invoiced or paid entries open read-only with the reason. Stopped unbilled entries can be deleted after a confirmation dialog (`DELETE /api/entries/:id?version=N`).
- Conflicts stay visible: if the entry changed elsewhere (409) or disappeared (404), Crops refetches state, shows the error in the dialog and sync status, and disables resending that stale revision. Reopen the entry to edit the latest version.
- Agent usage reported for an entry is shown as a small label such as “2.41M tokens · $31.40” (model in the edit dialog). Missing, null, or malformed usage is ignored.
- Foreground notification with Android's live chronometer and a Stop timer action.
- One serialized network queue, unique idempotency keys for creates, version-checked edits and deletes, server-authoritative timer state, server-clock correction, and conditional state requests that avoid downloading unchanged history. No automatic mutation retry after an ambiguous network outcome.
- Optional **Live cross-device sync** in Settings. A quiet, visible foreground notification checks for timers started on another device even while this app is in the background. Disable it from Settings or the notification's Pause sync action.

Running timers sync about every 5 seconds; enabled idle background sync checks every 15 seconds. Without idle sync, a remotely started timer is discovered when the app is open. Connectivity, Doze, force-stop, and manufacturer battery restrictions can delay synchronization. Elapsed time remains based on the server's start timestamp and does not depend on counting local ticks. After force-stop/reboot, reopen Crops to restore its notification. There is no offline mutation queue: connection failures remain visible.

Allow notifications when prompted to see your timer outside Crops. Android still permits a foreground service when notification permission is denied, but the timer notification is hidden from the notification drawer.

Team/client/project administration and invoiced/paid changes are in the web workspace. These are intentionally absent from the focused Android tracking interface.

## Build

Requirements: JDK 17, Android SDK platform 36, Android SDK build tools 35.0.0, and network access for the initial Gradle/Android plugin resolution. A checksum-pinned Gradle 8.14.3 wrapper is included. AGP is pinned to 8.13.0.

```sh
cd apps/android
export ANDROID_HOME="$HOME/Library/Android/sdk"
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
./build-apk.sh
```

For a release candidate, run `./gradlew :app:assembleRelease`; it produces an **unsigned**, shrunk APK. Before production distribution, configure your own signing key and use HTTPS. Keep the signing key outside the repository.

## Device verification

A dependency-free instrumentation suite checks native registration and login, Keystore persistence, the actual Start button, foreground chronometer and Stop action, stale UI/notification Stop after a remote stop-and-resume, manual entry, native edit/save and confirmed delete, stale-version edit/delete conflicts, running-entry edit rules, the agent usage label, resume, and background cross-device start/stop. Use an isolated development database; the suite creates a fresh test account each time.

```sh
# From the repository root, in another terminal:
PORT=8789 CROPS_DATA_DIR=/tmp/crops-android-test-db node server/dev.mjs

# With an emulator running:
cd apps/android
./verify-device.sh http://10.0.2.2:8789
```

For a USB device, first run `adb reverse tcp:8789 tcp:8789`, then pass `http://127.0.0.1:8789`. The script fails if the instrumentation does not report a successful test result.

## Service/security notes

The manifest declares Android 14+ `specialUse` foreground service permission/type, with a description of the user-visible timer use case. Play Store publication would require review of this service declaration. No location or personal sensor permissions are requested. UI and notification Stop, edit, and delete actions are bound to the displayed entry ID and version (edits use a real HTTP `PATCH`, which Android's platform `HttpURLConnection` supports; the server has no method-override header), so stale controls cannot stop a different timer or the same entry after it has been stopped and resumed elsewhere. Notification action identities also include that version. Session tokens are encrypted with a non-exportable Android Keystore AES-GCM key; app backup and device transfer are excluded.

Official Android references: [foreground service types](https://developer.android.com/develop/background-work/services/fgs/service-types), [notification permission](https://developer.android.com/develop/ui/views/notifications/notification-permission).
