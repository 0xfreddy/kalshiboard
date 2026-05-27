#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${TMPDIR:-/tmp}/kalshiboard-screensaver-build"
DIST_DIR="$ROOT_DIR/dist"
SAVER_NAME="KalshiBoard"
DMG_NAME="KalshiBoardScreensaver"
SAVER_DIR="$BUILD_DIR/$SAVER_NAME.saver"
CONTENTS_DIR="$SAVER_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
WEBAPP_DIR="$RESOURCES_DIR/WebApp"
DMG_ROOT="$BUILD_DIR/dmg-root"
DMG_RW="$BUILD_DIR/$DMG_NAME-rw.dmg"
OBJECT_DIR="$BUILD_DIR/objects"
ASSETS_DIR="$ROOT_DIR/macos-screensaver/Packaging/Assets"
ICONSET_DIR="$BUILD_DIR/KalshiBoardIcon.iconset"

export COPYFILE_DISABLE=1

rm -rf "$BUILD_DIR" "$DIST_DIR"
mkdir -p "$MACOS_DIR" "$WEBAPP_DIR/css" "$WEBAPP_DIR/js" "$DIST_DIR" "$DMG_ROOT" "$OBJECT_DIR" "$ICONSET_DIR"

if [[ -f "$ASSETS_DIR/kalshi.png" ]]; then
  sips -z 16 16 "$ASSETS_DIR/kalshi.png" --out "$ICONSET_DIR/icon_16x16.png" >/dev/null
  sips -z 32 32 "$ASSETS_DIR/kalshi.png" --out "$ICONSET_DIR/icon_16x16@2x.png" >/dev/null
  sips -z 32 32 "$ASSETS_DIR/kalshi.png" --out "$ICONSET_DIR/icon_32x32.png" >/dev/null
  sips -z 64 64 "$ASSETS_DIR/kalshi.png" --out "$ICONSET_DIR/icon_32x32@2x.png" >/dev/null
  sips -z 128 128 "$ASSETS_DIR/kalshi.png" --out "$ICONSET_DIR/icon_128x128.png" >/dev/null
  sips -z 256 256 "$ASSETS_DIR/kalshi.png" --out "$ICONSET_DIR/icon_128x128@2x.png" >/dev/null
  sips -z 256 256 "$ASSETS_DIR/kalshi.png" --out "$ICONSET_DIR/icon_256x256.png" >/dev/null
  sips -z 512 512 "$ASSETS_DIR/kalshi.png" --out "$ICONSET_DIR/icon_256x256@2x.png" >/dev/null
  sips -z 512 512 "$ASSETS_DIR/kalshi.png" --out "$ICONSET_DIR/icon_512x512.png" >/dev/null
  sips -z 1024 1024 "$ASSETS_DIR/kalshi.png" --out "$ICONSET_DIR/icon_512x512@2x.png" >/dev/null
  iconutil -c icns "$ICONSET_DIR" -o "$RESOURCES_DIR/KalshiBoardIcon.icns"
fi

ditto --norsrc "$ROOT_DIR/macos-screensaver/Info.plist" "$CONTENTS_DIR/Info.plist"
ditto --norsrc "$ROOT_DIR/index.html" "$WEBAPP_DIR/index.html"
ditto --norsrc "$ROOT_DIR/css" "$WEBAPP_DIR/css"
ditto --norsrc "$ROOT_DIR/js" "$WEBAPP_DIR/js"

if [[ -f "$ASSETS_DIR/thumbnail.png" ]]; then
  ditto --norsrc "$ASSETS_DIR/thumbnail.png" "$RESOURCES_DIR/thumbnail.png"
fi

if [[ -f "$ASSETS_DIR/patternkalshi.png" ]]; then
  ditto --norsrc "$ASSETS_DIR/patternkalshi.png" "$RESOURCES_DIR/patternkalshi.png"
fi

if [[ -f "$ASSETS_DIR/kalshi.png" ]]; then
  ditto --norsrc "$ASSETS_DIR/kalshi.png" "$RESOURCES_DIR/kalshi.png"
fi

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
mkdir -p "$DMG_ROOT/.background"
if [[ -f "$ASSETS_DIR/thumbnail.png" ]]; then
  ditto --norsrc "$ASSETS_DIR/thumbnail.png" "$DMG_ROOT/.background/thumbnail.png"
fi
if [[ -f "$RESOURCES_DIR/KalshiBoardIcon.icns" ]]; then
  ditto --norsrc "$RESOURCES_DIR/KalshiBoardIcon.icns" "$DMG_ROOT/.VolumeIcon.icns"
fi
xattr -cr "$DMG_ROOT"

hdiutil create \
  -volname "$DMG_NAME" \
  -srcfolder "$DMG_ROOT" \
  -ov \
  -format UDRW \
  "$DMG_RW"

MOUNT_DIR="$(mktemp -d "$BUILD_DIR/mount.XXXXXX")"
hdiutil attach "$DMG_RW" -mountpoint "$MOUNT_DIR" -nobrowse >/dev/null

if [[ -f "$MOUNT_DIR/.VolumeIcon.icns" ]]; then
  SetFile -a C "$MOUNT_DIR" 2>/dev/null || true
fi

if [[ -f "$MOUNT_DIR/.background/thumbnail.png" ]]; then
  if ! osascript <<APPLESCRIPT
set dmgFolder to POSIX file "$MOUNT_DIR" as alias
tell application "Finder"
  open dmgFolder
  delay 1
  tell front Finder window
    set current view to icon view
    set toolbar visible to false
    set statusbar visible to false
    set bounds to {120, 120, 1000, 612}
    set theViewOptions to the icon view options
    set arrangement of theViewOptions to not arranged
    set icon size of theViewOptions to 88
    set background picture of theViewOptions to file ".background:thumbnail.png" of dmgFolder
    set position of item "$SAVER_NAME.saver" of dmgFolder to {260, 290}
    set position of item "README.txt" of dmgFolder to {620, 290}
    update without registering applications
    delay 1
    close
  end tell
end tell
APPLESCRIPT
  then
    echo "Warning: Finder did not allow DMG window layout automation. The DMG still includes the background asset at .background/thumbnail.png." >&2
  fi
fi

sync
hdiutil detach "$MOUNT_DIR" >/dev/null
rmdir "$MOUNT_DIR"

hdiutil convert "$DMG_RW" \
  -ov \
  -format UDZO \
  -o "$DIST_DIR/$DMG_NAME.dmg"

echo "Built $SAVER_DIR"
echo "Built $DIST_DIR/$DMG_NAME.dmg"
