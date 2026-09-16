#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ -z "${JAVA_HOME:-}" ]] && [[ -x /usr/libexec/java_home ]]; then
  export JAVA_HOME="$(/usr/libexec/java_home -v 17)"
fi
export ANDROID_HOME="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
crops_adb="$ANDROID_HOME/platform-tools/adb"
crops_server="${1:-http://10.0.2.2:8789}"
"$crops_adb" get-state >/dev/null
./gradlew --console=plain -q :app:assembleDebug :app:assembleDebugAndroidTest
"$crops_adb" install -r app/build/outputs/apk/debug/app-debug.apk
"$crops_adb" install -r app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
"$crops_adb" shell pm grant com.crops.time android.permission.POST_NOTIFICATIONS
crops_results=$("$crops_adb" shell am instrument -w -e server "$crops_server" com.crops.time.test/com.crops.time.CropsInstrumentation)
printf '%s\n' "$crops_results"
[[ "$crops_results" == *"OK ("* ]]
