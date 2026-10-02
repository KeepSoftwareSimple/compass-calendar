#!/usr/bin/env bash
# Run `swift test` for pure SwiftPM packages under apps/calendar-macos (no XcodeGen).
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT"

PACKAGES=(CompassKit CompassData)
ran=0

for name in "${PACKAGES[@]}"; do
  dir="apps/calendar-macos/${name}"
  if [ ! -f "${dir}/Package.swift" ]; then
    echo "Skip ${name}: no Package.swift yet"
    continue
  fi
  echo "── swift test --package-path ${dir} ──"
  swift test --package-path "${dir}"
  ran=$((ran + 1))
done

if [ "$ran" -eq 0 ]; then
  echo "No SwiftPM packages to test under apps/calendar-macos" >&2
  exit 1
fi
