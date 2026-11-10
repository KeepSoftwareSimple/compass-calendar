#!/usr/bin/env bash
# Run `swift test` for native SwiftPM packages under apps/calendar-macos (no XcodeGen).
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT"

# CompassKitTests in `swift test --package-path CompassKit` mirror the
# `apps/calendar-macos/CompassKitTests/` tree (diff -rq reports no differences).
# macos-build already runs those cases via xcodebuild -only-testing:CompassKitTests
# plus CompassNativeTests. In CI, skip CompassKit here unless
# MACOS_SWIFT_PACKAGES_INCLUDE_COMPASSKIT=1 (local verify / strict parity).
default_packages=(CompassKit CompassData CompassUI)
PACKAGES=()
for name in "${default_packages[@]}"; do
  if [ "$name" = "CompassKit" ] && [ "${MACOS_SWIFT_PACKAGES_INCLUDE_COMPASSKIT:-1}" = "0" ]; then
    echo "Skip CompassKit SPM tests (duplicate of macos-build CompassKitTests)"
    continue
  fi
  PACKAGES+=("$name")
done
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
