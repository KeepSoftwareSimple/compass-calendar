#!/usr/bin/env bash
# Run `swift test` for native SwiftPM packages under apps/calendar-macos (no XcodeGen).
set -euo pipefail

export NSUnbufferedIO=YES

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

if [ "${#PACKAGES[@]}" -eq 0 ]; then
  echo "No SwiftPM packages to test under apps/calendar-macos" >&2
  exit 1
fi

skip_build=0
if [ "${MACOS_SWIFT_PACKAGES_SKIP_BUILD:-0}" = "1" ]; then
  skip_build=1
  echo "swift-packages: skip build (using warmed .build artifacts)"
fi

run_package_tests() {
  local name="$1"
  local dir="apps/calendar-macos/${name}"
  if [ ! -f "${dir}/Package.swift" ]; then
    echo "Skip ${name}: no Package.swift yet"
    return 0
  fi
  local -a args=(test --package-path "${dir}")
  if [ "$skip_build" = "1" ]; then
    args+=(--skip-build)
  fi
  echo "── swift ${args[*]} ──"
  local start
  start=$(date +%s)
  swift "${args[@]}"
  echo "── ${name} tests finished in $(( $(date +%s) - start ))s ──"
}

job_start=$(date +%s)
status=0
for name in "${PACKAGES[@]}"; do
  if ! run_package_tests "$name"; then
    status=1
  fi
done

echo "swift-packages total wall time: $(( $(date +%s) - job_start ))s"
exit "$status"
