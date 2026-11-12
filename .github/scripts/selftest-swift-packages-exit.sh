#!/usr/bin/env bash
# Verify swift-packages log parsing catches XCTest failures even when swift exits 0.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)

swift_package_log_has_test_failures() {
  local log="$1"
  if grep -qE 'Executed [0-9]+ tests?, with [1-9][0-9]* failures' "$log"; then
    return 0
  fi
  if grep -qE "Test Suite 'All tests' failed" "$log"; then
    return 0
  fi
  return 1
}

fixture="${ROOT}/.github/scripts/fixtures/swift-test-xctest-failure-sample.txt"
if ! swift_package_log_has_test_failures "$fixture"; then
  echo "selftest: expected fixture log to count as failures" >&2
  exit 1
fi

pass_log=$(mktemp)
trap 'rm -f "$pass_log"' EXIT
cat >"$pass_log" <<'EOF'
Test Suite 'All tests' passed at 2026-01-01 00:00:00.000.
	 Executed 12 tests, with 0 failures (0 unexpected) in 0.010 (0.012) seconds
EOF
if swift_package_log_has_test_failures "$pass_log"; then
  echo "selftest: pass log must not count as failures" >&2
  exit 1
fi

echo "selftest-swift-packages-exit: ok"
