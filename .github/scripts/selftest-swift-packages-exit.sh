#!/usr/bin/env bash
# Verify swift-packages log parsing catches XCTest failures even when swift exits 0.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
# shellcheck source=swift-packages-log-detect.sh
source "${ROOT}/.github/scripts/swift-packages-log-detect.sh"

fixture="${ROOT}/.github/scripts/fixtures/swift-test-xctest-failure-43186705883-sample.txt"
if ! swift_package_log_has_test_failures "$fixture"; then
  echo "selftest: expected fixture log to count as failures" >&2
  exit 1
fi

pass_log=$(mktemp)
trap 'rm -f "$pass_log"' EXIT
cat >"$pass_log" <<'EOF'
Test Suite 'All tests' passed at 2026-01-01 00:00:00.000.
	 Executed 12 tests, with 0 failures (0 unexpected) in 0.010 (0.012) seconds
◇ Test run started.
↳ Testing Library Version: 1902
✔ Test run with 0 tests in 0 suites passed after 0.001 seconds.
compiled with 3 issues in other contexts
EOF
if swift_package_log_has_test_failures "$pass_log"; then
  echo "selftest: pass log must not count as failures" >&2
  exit 1
fi

skipped_pass_log=$(mktemp)
trap 'rm -f "$pass_log" "$skipped_pass_log"' EXIT
cat >"$skipped_pass_log" <<'EOF'
Test Suite 'All tests' passed at 2026-01-01 00:00:00.000.
	 Executed 100 tests, with 3 tests skipped and 0 failures (0 unexpected) in 1.0 (1.1) seconds
EOF
if swift_package_log_has_test_failures "$skipped_pass_log"; then
  echo "selftest: skipped-only summary must not count as failures" >&2
  exit 1
fi

echo "selftest-swift-packages-exit: ok"
