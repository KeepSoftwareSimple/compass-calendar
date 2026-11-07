#!/usr/bin/env bash
# Isolated wide meeting-link viewport XCTest (requires macos-build artifact cache).
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

echo "── wide meeting-link viewport XCTest ──"
xcodebuild test-without-building "${common_args[@]}" \
  -resultBundlePath build/Compass-meeting-link-wide.xcresult \
  -only-testing:CompassUITests/EventFormMeetingLinkWideViewportTests
