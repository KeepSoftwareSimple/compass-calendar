#!/usr/bin/env bash
# XcodeGen + xcodebuild for the Compass macOS app and tests.
# Uses repo-local DerivedData so CI caches (test-macos.yml) restore cleanly.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT/apps/calendar-macos"

xcodegen generate

mkdir -p build

common_args=(
  -project Compass.xcodeproj
  -scheme Compass
  -destination "platform=macOS"
  -derivedDataPath build/DerivedData
  -clonedSourcePackagesDirPath build/SourcePackages
)

if [ -n "${MACOS_XCRESULT_PATH:-}" ]; then
  common_args+=(-resultBundlePath "$MACOS_XCRESULT_PATH")
fi

# UI suites are independent app launches; parallel classes cuts wall time on Mac runners.
parallel_args=()
if [ "${MACOS_PARALLEL_UI_TESTS:-1}" != "0" ]; then
  parallel_args+=(
    -parallel-testing-enabled YES
    -maximum-parallel-testing-workers "${MACOS_PARALLEL_TEST_WORKERS:-3}"
  )
fi

echo "── xcodebuild build-for-testing (Compass scheme) ──"
xcodebuild build-for-testing "${common_args[@]}"

echo "── xcodebuild test-without-building (Compass scheme) ──"
xcodebuild test-without-building "${common_args[@]}" "${parallel_args[@]}"
