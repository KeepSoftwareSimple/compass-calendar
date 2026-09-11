#!/usr/bin/env bash
# Local assertions for autofix-preflight.sh retry vs skip.
# Run: bash .github/scripts/autofix-preflight.test.sh
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT"

PASS=0
FAIL=0

STUB_DIR=$(mktemp -d)
OUTPUT=$(mktemp)
GH_LOG=$(mktemp)
trap 'rm -rf "$STUB_DIR" "$OUTPUT" "$GH_LOG"' EXIT

cat >"${STUB_DIR}/gh" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${AUTOFIX_TEST_GH_LOG}"
args="$*"
if [[ "$args" == *"issue view"* && "$args" == *"--json labels"* ]]; then
  printf '%s\n' "${AUTOFIX_TEST_LABELS:-}"
  exit 0
fi
if [[ "$args" == *"issue view"* && "$args" == *"--json state"* ]]; then
  printf '%s\n' "${AUTOFIX_TEST_STATE:-OPEN}"
  exit 0
fi
if [[ "$args" == *"creator=posthog"* ]]; then
  printf '%s\n' "${AUTOFIX_TEST_POSTHOG_COUNT:-0}"
  exit 0
fi
if [[ "$args" == *"pr list"* ]]; then
  printf '%s\n' "${AUTOFIX_TEST_MERGED_COUNT:-0}"
  exit 0
fi
if [[ "$args" == *"label create"* ]]; then
  exit 0
fi
if [[ "$args" == *"issue edit"* || "$args" == *"issue reopen"* ]]; then
  exit 0
fi
printf 'unexpected gh invocation: %s\n' "$args" >&2
exit 1
STUB
chmod +x "${STUB_DIR}/gh"

run_preflight() {
  : >"$OUTPUT"
  : >"$GH_LOG"
  PATH="${STUB_DIR}:${PATH}" \
    GITHUB_OUTPUT="$OUTPUT" \
    GH_REPO="example/compass" \
    AUTOFIX_TEST_GH_LOG="$GH_LOG" \
    AUTOFIX_TEST_LABELS="${AUTOFIX_TEST_LABELS-}" \
    AUTOFIX_TEST_STATE="${AUTOFIX_TEST_STATE:-OPEN}" \
    AUTOFIX_TEST_POSTHOG_COUNT="${AUTOFIX_TEST_POSTHOG_COUNT:-0}" \
    AUTOFIX_TEST_MERGED_COUNT="${AUTOFIX_TEST_MERGED_COUNT:-0}" \
    GITHUB_EVENT_NAME="${GITHUB_EVENT_NAME:-issues}" \
    GITHUB_EVENT_ACTION="${GITHUB_EVENT_ACTION:-opened}" \
    AUTOFIX_RETRY_ATTEMPT="${AUTOFIX_RETRY_ATTEMPT:-0}" \
    bash "${ROOT}/.github/scripts/autofix-preflight.sh" 42 >/dev/null
}

assert_output() {
  local want=$1
  local name=$2
  if grep -qx "$want" "$OUTPUT"; then
    echo "ok ${name}"
    PASS=$((PASS + 1))
  else
    echo "FAIL ${name}: wanted '${want}' in:$(cat "$OUTPUT")" >&2
    FAIL=$((FAIL + 1))
  fi
}

assert_gh_contains() {
  local needle=$1
  local name=$3
  if grep -Fq -- "$needle" "$GH_LOG"; then
    echo "ok ${name}"
    PASS=$((PASS + 1))
  else
    echo "FAIL ${name}: missing '${needle}' in:$(cat "$GH_LOG")" >&2
    FAIL=$((FAIL + 1))
  fi
}

assert_gh_not_contains() {
  local needle=$1
  local name=$3
  if grep -Fq -- "$needle" "$GH_LOG"; then
    echo "FAIL ${name}: unexpectedly found '${needle}' in:$(cat "$GH_LOG")" >&2
    FAIL=$((FAIL + 1))
  else
    echo "ok ${name}"
    PASS=$((PASS + 1))
  fi
}

AUTOFIX_TEST_LABELS=""
run_preflight
assert_output "proceed=true" "clean issue proceeds"
assert_gh_contains "--add-label autofix" x "clean issue is labeled autofix"

AUTOFIX_TEST_LABELS="autofix"
run_preflight
assert_output "proceed=false" "autofix label skips without retry"

AUTOFIX_TEST_LABELS=$'autofix\nautofix:failed'
run_preflight
assert_output "proceed=true" "autofix:failed is a retry"
assert_gh_contains "--remove-label autofix:failed" x "retry clears the failed label"

AUTOFIX_TEST_LABELS="autofix"
GITHUB_EVENT_ACTION=reopened
run_preflight
assert_output "proceed=true" "reopened event retries even with autofix"
GITHUB_EVENT_ACTION=opened

AUTOFIX_TEST_LABELS=""
AUTOFIX_RETRY_ATTEMPT=1
run_preflight
assert_output "proceed=true" "automatic retry dispatch proceeds"
AUTOFIX_RETRY_ATTEMPT=0

AUTOFIX_TEST_LABELS=""
AUTOFIX_TEST_STATE=CLOSED
run_preflight
assert_output "proceed=true" "closed issue proceeds after reopen"
assert_gh_contains "issue reopen" x "closed issue is reopened"

AUTOFIX_TEST_LABELS="autofix"
AUTOFIX_TEST_STATE=CLOSED
run_preflight
assert_output "proceed=true" "closed issue with leftover autofix is a retry"
assert_gh_contains "issue reopen" x "recurrence reopens the closed GitHub issue"
AUTOFIX_TEST_STATE=OPEN
AUTOFIX_TEST_LABELS=""

AUTOFIX_TEST_LABELS="autofix"
AUTOFIX_TEST_POSTHOG_COUNT=4
run_preflight
assert_output "proceed=false" "already-labeled skip happens before rate limit"

AUTOFIX_TEST_LABELS=""
AUTOFIX_TEST_POSTHOG_COUNT=4
run_preflight
assert_output "proceed=false" "more than 3 posthog issues in 6h pauses"
assert_gh_not_contains "--add-label autofix" x "rate-limit skip does not add autofix"
AUTOFIX_TEST_POSTHOG_COUNT=0

AUTOFIX_TEST_MERGED_COUNT=2
run_preflight
assert_output "proceed=false" "2 autofix merges in 2h pauses"
AUTOFIX_TEST_MERGED_COUNT=0

if [ "$FAIL" -ne 0 ]; then
  echo "FAILED ${FAIL}  passed ${PASS}" >&2
  exit 1
fi
echo "passed ${PASS}"
