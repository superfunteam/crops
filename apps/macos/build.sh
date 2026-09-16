#!/bin/bash
set -euo pipefail
MACOS_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$MACOS_DIR/../.." && pwd)"
OUTPUT_DIR="${CROPS_OUTPUT_DIR:-$REPO_DIR/artifacts}"
APP_PATH="$OUTPUT_DIR/Crops.app"

swift build --package-path "$MACOS_DIR" -c release --product Crops --arch arm64
swift build --package-path "$MACOS_DIR" -c release --product Crops --arch x86_64
mkdir -p "$APP_PATH/Contents/MacOS" "$APP_PATH/Contents/Resources"
lipo -create "$MACOS_DIR/.build/arm64-apple-macosx/release/Crops" "$MACOS_DIR/.build/x86_64-apple-macosx/release/Crops" -output "$APP_PATH/Contents/MacOS/Crops"
cp "$MACOS_DIR/Resources/Info.plist" "$APP_PATH/Contents/Info.plist"
swift "$MACOS_DIR/scripts/make-icon.swift" "$MACOS_DIR/.build/Crops.iconset"
iconutil -c icns "$MACOS_DIR/.build/Crops.iconset" -o "$APP_PATH/Contents/Resources/Crops.icns"
codesign --force --deep --sign "${CROPS_SIGNING_IDENTITY:--}" "$APP_PATH"
codesign --verify --deep --strict "$APP_PATH"
ditto -c -k --sequesterRsrc --keepParent "$APP_PATH" "$OUTPUT_DIR/Crops-macOS.zip"
printf 'Built %s\n' "$APP_PATH"
