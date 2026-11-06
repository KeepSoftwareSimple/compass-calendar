#!/usr/bin/env bash
# XcodeGen + build-for-testing + CompassKitTests (no UI tests).
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

echo "── xcodebuild build-for-testing (Compass scheme) ──"
xcodebuild build-for-testing "${common_args[@]}"

echo "── xcodebuild test-without-building (CompassKitTests only) ──"
xcodebuild test-without-building "${common_args[@]}" -only-testing:CompassKitTests
