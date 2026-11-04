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

parallel_args=()
if [ "${MACOS_PARALLEL_UI_TESTS:-0}" = "1" ]; then
  parallel_args+=(
    -parallel-testing-enabled YES
    -maximum-parallel-testing-workers "${MACOS_PARALLEL_TEST_WORKERS:-2}"
  )
fi

echo "── xcodebuild build-for-testing (Compass scheme) ──"
xcodebuild build-for-testing "${common_args[@]}"

test_args=("${common_args[@]}")
if [ -n "${MACOS_XCRESULT_PATH:-}" ]; then
  rm -rf "$MACOS_XCRESULT_PATH"
  test_args+=(-resultBundlePath "$MACOS_XCRESULT_PATH")
fi

echo "── xcodebuild test-without-building (Compass scheme) ──"
xcodebuild test-without-building "${test_args[@]}" "${parallel_args[@]}"
