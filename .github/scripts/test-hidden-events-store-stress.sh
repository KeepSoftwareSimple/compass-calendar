#!/usr/bin/env bash
# Stress one XCTest case on macOS to prove ordering fix (not a CI gate).
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT"

iterations="${1:-50}"
filter="${2:-HiddenEventsStoreTests.testSupersededWriteReturnsWithoutApplying}"
dir="apps/calendar-macos/CompassData"

for i in $(seq 1 "$iterations"); do
  echo "── iteration ${i}/${iterations} (${filter}) ──"
  swift test --package-path "$dir" --filter "$filter"
done

echo "Stress complete: ${iterations} iterations passed."
