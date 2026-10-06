#!/usr/bin/env bash
# Assertions for macos-release-launch-smoke.sh (Linux-safe; no app launch).
# Run: bash .github/scripts/macos-release-launch-smoke.test.sh
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT"

PASS=0
FAIL=0

assert_contains() {
  local haystack=$1
  local needle=$2
  local name=$3
  if printf '%s' "$haystack" | grep -Fq "$needle"; then
    echo "ok ${name}"
    PASS=$((PASS + 1))
  else
    echo "FAIL ${name}: missing '${needle}'" >&2
    FAIL=$((FAIL + 1))
  fi
}

script=$(cat .github/scripts/macos-release-launch-smoke.sh)

assert_contains "$script" 'identifier of window 1' "smoke waits on native window identifier"
assert_contains "$script" 'compass-native-welcome-modal' "smoke waits for native welcome modal"
assert_contains "$script" 'compass-native-header' "smoke accepts demo header as native chrome"

usage_out=$(bash .github/scripts/macos-release-launch-smoke.sh 2>&1 || true)
assert_contains "$usage_out" 'Usage: macos-release-launch-smoke.sh' "smoke requires app path"

if [ "$FAIL" -gt 0 ]; then
  echo "${FAIL} failed, ${PASS} passed" >&2
  exit 1
fi

echo "macos-release-launch-smoke.test.sh: ${PASS} passed"
