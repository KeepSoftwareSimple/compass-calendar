#!/usr/bin/env bash
# Run `swift test` for native SwiftPM packages under apps/calendar-macos (no XcodeGen).
set -euo pipefail

export NSUnbufferedIO=YES

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT"

bash "${ROOT}/.github/scripts/selftest-swift-packages-exit.sh"

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

# `swift test` can exit 0 when XCTest suites fail and Swift Testing runs afterward
# with zero tests. Scan the full log for XCTest and Swift Testing failure markers.
swift_package_log_has_test_failures() {
  local log="$1"
  if grep -qE 'Executed [0-9]+ tests?, with [1-9][0-9]* failures' "$log"; then
    return 0
  fi
  if grep -qE "Test Suite 'All tests' failed" "$log"; then
    return 0
  fi
  if grep -qE 'Test run with [1-9][0-9]* failures' "$log"; then
    return 0
  fi
  if grep -qE 'with [1-9][0-9]* issues' "$log"; then
    return 0
  fi
  return 1
}

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
  local log
  log=$(mktemp)
  local swift_ec=0
  set +e
  swift "${args[@]}" 2>&1 | tee "$log"
  swift_ec=${PIPESTATUS[0]}
  set -e
  local parsed_fail=0
  if swift_package_log_has_test_failures "$log"; then
    echo "swift-packages: ${name} reported test failures in log (swift exit ${swift_ec})" >&2
    parsed_fail=1
  fi
  rm -f "$log"
  echo "── ${name} tests finished in $(( $(date +%s) - start ))s ──"
  if [ "$swift_ec" -ne 0 ] || [ "$parsed_fail" -ne 0 ]; then
    return 1
  fi
  return 0
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
