#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if [[ -z "${JAVA_HOME:-}" ]] && [[ -x /usr/libexec/java_home ]]; then
  export JAVA_HOME="$(/usr/libexec/java_home -v 17)"
fi
if [[ -z "${ANDROID_HOME:-}" ]]; then
  export ANDROID_HOME="${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}"
fi
./gradlew --console=plain :app:assembleDebug :app:lintDebug
mkdir -p ../../artifacts
cp app/build/outputs/apk/debug/app-debug.apk ../../artifacts/Crops-android.apk
mkdir -p ../../web/public/downloads
cp ../../artifacts/Crops-android.apk ../../web/public/downloads/Crops-android.apk
printf 'APK ready: %s/artifacts/Crops-android.apk\n' "$(cd ../.. && pwd)"
