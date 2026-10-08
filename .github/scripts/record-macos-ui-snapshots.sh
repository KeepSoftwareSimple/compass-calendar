#!/usr/bin/env bash
# Record CompassUITests image snapshots (ReferenceImages/*.png) on a macOS runner.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT/apps/calendar-macos"

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "xcodegen is required" >&2
  exit 1
fi

bash "$ROOT/.github/scripts/render-macos-icon.sh"
xcodegen generate

export RECORD_SNAPSHOTS=1
xcodebuild test \
  -project Compass.xcodeproj \
  -scheme Compass \
  -destination platform=macOS \
  -derivedDataPath build/DerivedData \
  -clonedSourcePackagesDirPath build/SourcePackages \
  -only-testing:CompassUITests/NativeImageSnapshotTests

echo "Recorded snapshots under CompassUITests/ReferenceImages/"
