#!/usr/bin/env bash
# Shared swift-packages XCTest / Swift Testing failure detection (sourced, not executed).
swift_package_log_has_test_failures() {
  local log="$1"
  # XCTest aggregate line, including "with N tests skipped and M failures".
  if grep -qE 'Executed [0-9]+ tests?, with ([0-9]+ tests? skipped and )?[1-9][0-9]* failures' "$log"; then
    return 0
  fi
  if grep -qE "Test Suite 'All tests' failed" "$log"; then
    return 0
  fi
  if grep -qE "Test Suite 'CompassDataPackageTests.xctest' failed" "$log"; then
    return 0
  fi
  # Swift Testing failed runs (exclude "0 tests" pass summaries).
  if grep -qE 'Test run with [1-9][0-9]* tests.*failed' "$log"; then
    return 0
  fi
  if grep -qE '✗.*failed' "$log"; then
    return 0
  fi
  return 1
}
