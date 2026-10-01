#!/usr/bin/env bash
# Builds Resources/icon.icns from Resources/icon.png or a favicon placeholder.
# Used by test-macos.yml and release-macos.yml on macOS runners.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MACOS_DIR="${ROOT}/apps/calendar-macos"
RES="${MACOS_DIR}/Resources"
ICON_PNG="${RES}/icon.png"
FAVICON="${ROOT}/apps/calendar-web/src/favicon.ico"
WORK="${MACOS_DIR}/build/icon-work"
ICONSET="${WORK}/AppIcon.iconset"

mkdir -p "$ICONSET"

if [ -f "$ICON_PNG" ]; then
  echo "Using committed ${ICON_PNG}"
  SOURCE="$ICON_PNG"
  PLACEHOLDER=0
else
  echo "::notice::No apps/calendar-macos/Resources/icon.png; using web favicon as placeholder icon."
  SOURCE="${WORK}/icon-source.png"
  sips -s format png "$FAVICON" --out "$SOURCE" >/dev/null
  sips -z 1024 1024 "$SOURCE" --out "$SOURCE" >/dev/null
  PLACEHOLDER=1
fi

make_icon() {
  local size="$1"
  local name="$2"
  sips -z "$size" "$size" "$SOURCE" --out "${ICONSET}/${name}" >/dev/null
}

make_icon 16 icon_16x16.png
make_icon 32 icon_16x16@2x.png
make_icon 32 icon_32x32.png
make_icon 64 icon_32x32@2x.png
make_icon 128 icon_128x128.png
make_icon 256 icon_128x128@2x.png
make_icon 256 icon_256x256.png
make_icon 512 icon_256x256@2x.png
make_icon 512 icon_512x512.png
make_icon 1024 icon_512x512@2x.png

iconutil -c icns "$ICONSET" -o "${RES}/icon.icns"
echo "Wrote ${RES}/icon.icns (placeholder=${PLACEHOLDER})"
