#!/usr/bin/env bash
# Local/verify full macOS test pass: build-for-testing, kit tests, then all UI tests.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
bash "$ROOT/.github/scripts/test-macos-build-for-testing.sh"

cd "$ROOT/apps/calendar-macos"
common_args=(
  -project Compass.xcodeproj
  -scheme Compass
  -destination "platform=macOS"
  -derivedDataPath build/DerivedData
  -clonedSourcePackagesDirPath build/SourcePackages
)

test_args=("${common_args[@]}")
if [ -n "${MACOS_XCRESULT_PATH:-}" ]; then
  rm -rf "$MACOS_XCRESULT_PATH"
  test_args+=(-resultBundlePath "$MACOS_XCRESULT_PATH")
fi

echo "── xcodebuild test-without-building (CompassUITests, full suite) ──"
xcodebuild test-without-building "${test_args[@]}"
