#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${TMPDIR:-/tmp}/kalshiboard-screensaver-build"
DIST_DIR="$ROOT_DIR/dist"
SAVER_NAME="KalshiBoard"
SAVER_DIR="$BUILD_DIR/$SAVER_NAME.saver"
CONTENTS_DIR="$SAVER_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
WEBAPP_DIR="$RESOURCES_DIR/WebApp"
DMG_ROOT="$BUILD_DIR/dmg-root"
OBJECT_DIR="$BUILD_DIR/objects"

export COPYFILE_DISABLE=1

rm -rf "$BUILD_DIR" "$DIST_DIR"
mkdir -p "$MACOS_DIR" "$WEBAPP_DIR/css" "$WEBAPP_DIR/js" "$DIST_DIR" "$DMG_ROOT" "$OBJECT_DIR"

ditto --norsrc "$ROOT_DIR/macos-screensaver/Info.plist" "$CONTENTS_DIR/Info.plist"
ditto --norsrc "$ROOT_DIR/index.html" "$WEBAPP_DIR/index.html"
ditto --norsrc "$ROOT_DIR/css" "$WEBAPP_DIR/css"
ditto --norsrc "$ROOT_DIR/js" "$WEBAPP_DIR/js"

if [[ -f "$ROOT_DIR/screenshot.png" ]]; then
  ditto --norsrc "$ROOT_DIR/screenshot.png" "$WEBAPP_DIR/screenshot.png"
fi

for ARCH in arm64 x86_64; do
  xcrun swiftc \
    -target "$ARCH-apple-macos13.0" \
    -emit-library \
    -module-name KalshiBoardSaver \
    -o "$OBJECT_DIR/$SAVER_NAME-$ARCH" \
    "$ROOT_DIR/macos-screensaver/Sources/KalshiBoardSaverView.swift" \
    -framework AppKit \
    -framework Network \
    -framework ScreenSaver \
    -framework WebKit \
    -Xlinker -bundle
done

lipo -create \
  "$OBJECT_DIR/$SAVER_NAME-arm64" \
  "$OBJECT_DIR/$SAVER_NAME-x86_64" \
  -output "$MACOS_DIR/$SAVER_NAME"

xattr -cr "$SAVER_DIR"
codesign --force --deep --sign - "$SAVER_DIR"
codesign --verify --deep --strict --verbose=2 "$SAVER_DIR"

ditto --norsrc "$SAVER_DIR" "$DMG_ROOT/$SAVER_NAME.saver"
ditto --norsrc "$ROOT_DIR/macos-screensaver/Packaging/README.txt" "$DMG_ROOT/README.txt"
xattr -cr "$DMG_ROOT"

hdiutil create \
  -volname "$SAVER_NAME" \
  -srcfolder "$DMG_ROOT" \
  -ov \
  -format UDZO \
  "$DIST_DIR/$SAVER_NAME.dmg"

echo "Built $SAVER_DIR"
echo "Built $DIST_DIR/$SAVER_NAME.dmg"
