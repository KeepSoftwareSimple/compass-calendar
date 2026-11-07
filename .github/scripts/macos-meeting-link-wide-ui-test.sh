#!/usr/bin/env bash
# Isolated wide meeting-link viewport XCTest (requires macos-build artifact cache).
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT/apps/calendar-macos"

xcodegen generate
mkdir -p build/wide-uitest-watchdog

TRACE_PATH=/tmp/compass-wide-uitest-trace.ndjson
rm -f "$TRACE_PATH"

common_args=(
  -project Compass.xcodeproj
  -scheme Compass
  -destination "platform=macOS"
  -derivedDataPath build/DerivedData
  -clonedSourcePackagesDirPath build/SourcePackages
)

watchdog_loop() {
  local xcode_pid=$1
  local seq=0
  while kill -0 "$xcode_pid" 2>/dev/null; do
    seq=$((seq + 1))
    local stamp
    stamp=$(date -u +%Y%m%dT%H%M%SZ)
    screencapture -x "build/wide-uitest-watchdog/desktop-${stamp}-${seq}.png" 2>/dev/null || true
    if pid=$(pgrep -x Compass | head -1); then
      sample "$pid" 1 -mayDie -file "build/wide-uitest-watchdog/compass-${stamp}-${seq}.txt" 2>/dev/null || true
    fi
    if pid=$(pgrep -x CompassUITests-Runner | head -1); then
      sample "$pid" 1 -mayDie -file "build/wide-uitest-watchdog/runner-${stamp}-${seq}.txt" 2>/dev/null || true
    fi
    if [[ -f "$TRACE_PATH" ]]; then
      cp "$TRACE_PATH" "build/wide-uitest-watchdog/trace-${stamp}-${seq}.ndjson"
    else
      echo "{\"note\":\"trace_missing\",\"stamp\":\"${stamp}\"}" >"build/wide-uitest-watchdog/trace-${stamp}-${seq}.missing"
    fi
    sleep 12
  done
}

echo "── wide meeting-link viewport XCTest (instrumented) ──"
set +e
xcodebuild test-without-building "${common_args[@]}" \
  -resultBundlePath build/Compass-meeting-link-wide.xcresult \
  -only-testing:CompassUITests/EventFormMeetingLinkWideViewportTests &
xcode_pid=$!
set -e

watchdog_loop "$xcode_pid" &
watchdog_pid=$!

set +e
wait "$xcode_pid"
test_status=$?
set -e

kill "$watchdog_pid" 2>/dev/null || true
wait "$watchdog_pid" 2>/dev/null || true

if [[ -f "$TRACE_PATH" ]]; then
  cp "$TRACE_PATH" build/wide-uitest-watchdog/trace-final.ndjson
else
  echo '{"event":"trace_never_created"}' >build/wide-uitest-watchdog/trace-final.ndjson
fi

xcresult=build/Compass-meeting-link-wide.xcresult
if [[ -d "$xcresult" ]]; then
  xcrun xcresulttool get test-results summary --path "$xcresult" --format json \
    >build/wide-uitest-watchdog/xcresult-summary.json 2>/dev/null \
    || echo '{"xcresulttool":"summary_failed"}' >build/wide-uitest-watchdog/xcresult-summary.json
  xcrun xcresulttool get test-results tests --path "$xcresult" --format json \
    >build/wide-uitest-watchdog/xcresult-tests.json 2>/dev/null \
    || echo '{"xcresulttool":"tests_failed"}' >build/wide-uitest-watchdog/xcresult-tests.json
  xcrun xcresulttool export diagnostics --path "$xcresult" --output-path build/wide-uitest-watchdog/xcresult-diagnostics \
    2>/dev/null || mkdir -p build/wide-uitest-watchdog/xcresult-diagnostics
fi

exit "$test_status"
