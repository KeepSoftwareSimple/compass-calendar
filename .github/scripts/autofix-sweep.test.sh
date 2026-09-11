#!/usr/bin/env bash
# Local assertions for autofix-sweep.sh.
# Run: bash .github/scripts/autofix-sweep.test.sh
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT"

PASS=0
FAIL=0

STUB_DIR=$(mktemp -d)
OUT=$(mktemp)
GH_LOG=$(mktemp)
FIXTURE=$(mktemp)
trap 'rm -rf "$STUB_DIR" "$OUT" "$GH_LOG" "$FIXTURE"' EXIT

cat >"${STUB_DIR}/gh" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${AUTOFIX_TEST_GH_LOG}"
args="$*"
if [[ "$args" == *"issue list"* ]]; then
  id=""
  if [[ "$args" =~ ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}) ]]; then
    id="${BASH_REMATCH[1]}"
  else
    for token in "$@"; do
      case "$token" in
        *in:body*) id="${token%% *}" ;;
      esac
    done
  fi
  printf '%s' "${AUTOFIX_TEST_ISSUES:-"{}"}" | jq -c --arg id "$id" '.[$id] // empty'
  exit 0
fi
if [[ "$args" == *"issues/"*"/comments"* ]]; then
  printf '%s\n' "${AUTOFIX_TEST_COMMENT_AT:-}"
  exit 0
fi
if [[ "$args" == *"workflow run"* || "$args" == *"issue create"* ]]; then
  if [[ "$args" == *"issue create"* ]]; then
    printf 'https://github.com/example/compass/issues/99\n'
  fi
  exit 0
fi
printf 'unexpected gh invocation: %s\n' "$args" >&2
exit 1
STUB
chmod +x "${STUB_DIR}/gh"

row() {
  jq -nc --arg id "$1" --arg seen "$2" --arg msg "$3" --arg fp "${4:-fp}" \
    '{issue_id:$id,fingerprint:$fp,message:$msg,last_seen:$seen,occurrences:1}'
}

run_sweep() {
  : >"$GH_LOG"
  PATH="${STUB_DIR}:${PATH}" \
    GH_REPO="example/compass" \
    AUTOFIX_TEST_GH_LOG="$GH_LOG" \
    AUTOFIX_TEST_ISSUES="${AUTOFIX_TEST_ISSUES:-"{}"}" \
    AUTOFIX_TEST_COMMENT_AT="${AUTOFIX_TEST_COMMENT_AT:-}" \
    AUTOFIX_SWEEP_FIXTURE="$FIXTURE" \
    AUTOFIX_SWEEP_DRY_RUN=1 \
    AUTOFIX_SWEEP_MAX_DISPATCHES="${AUTOFIX_SWEEP_MAX_DISPATCHES:-2}" \
    AUTOFIX_SWEEP_IN_FLIGHT_MINUTES=90 \
    bash "${ROOT}/.github/scripts/autofix-sweep.sh" >"$OUT"
}

assert_out_contains() {
  local needle=$1
  local name=$2
  if grep -Fq -- "$needle" "$OUT"; then
    echo "ok ${name}"
    PASS=$((PASS + 1))
  else
    echo "FAIL ${name}: missing '${needle}' in:$(cat "$OUT")" >&2
    FAIL=$((FAIL + 1))
  fi
}

assert_out_not_contains() {
  local needle=$1
  local name=$2
  if grep -Fq -- "$needle" "$OUT"; then
    echo "FAIL ${name}: unexpectedly found '${needle}' in:$(cat "$OUT")" >&2
    FAIL=$((FAIL + 1))
  else
    echo "ok ${name}"
    PASS=$((PASS + 1))
  fi
}

ISSUE_A="01a042b6-4e57-7611-9a1f-cdd9436e0ff2"
ISSUE_B="01a04156-2b7b-7580-90c0-05dc25299caa"
ISSUE_C="01a02693-a9c0-72b0-b7f5-2ee68a0db95a"

# No GitHub issue: create + dispatch.
row "$ISSUE_A" "2026-09-11T12:00:00Z" "PROVIDER_FAILURE" >"$FIXTURE"
AUTOFIX_TEST_ISSUES='{}'
run_sweep
assert_out_contains "create #0 (${ISSUE_A})" "missing GitHub issue is created and dispatched"

# Closed after last_seen: skip.
cat >"$FIXTURE" <<EOF
$(row "$ISSUE_A" "2026-09-01T00:00:00Z" "PROVIDER_FAILURE")
EOF
AUTOFIX_TEST_ISSUES=$(jq -n --arg id "$ISSUE_A" '{
  ($id): {number: 2901, state:"CLOSED", closedAt:"2026-09-10T00:00:00Z", labels:[], updatedAt:"2026-09-10T00:00:00Z"}
}')
run_sweep
assert_out_contains "skip ${ISSUE_A} (skip-still-quiet)" "closed issue with no later event is skipped"

# Closed before last_seen: recurrence dispatch.
cat >"$FIXTURE" <<EOF
$(row "$ISSUE_A" "2026-09-11T12:00:00Z" "PROVIDER_FAILURE")
EOF
AUTOFIX_TEST_ISSUES=$(jq -n --arg id "$ISSUE_A" '{
  ($id): {number: 2901, state:"CLOSED", closedAt:"2026-09-08T00:00:00Z", labels:[{name:"autofix"}], updatedAt:"2026-09-10T00:00:00Z"}
}')
run_sweep
assert_out_contains "recurrence #2901 (${ISSUE_A})" "closed issue with a later event is dispatched"

# Open with autofix:failed: dispatch.
AUTOFIX_TEST_ISSUES=$(jq -n --arg id "$ISSUE_A" '{
  ($id): {number: 3369, state:"OPEN", closedAt:null, labels:[{name:"autofix:failed"}], updatedAt:"2026-09-05T00:00:00Z"}
}')
run_sweep
assert_out_contains "failed #3369 (${ISSUE_A})" "autofix:failed is dispatched"

# Open, handled after last_seen: skip.
AUTOFIX_TEST_COMMENT_AT="2026-09-11T18:00:00Z"
AUTOFIX_TEST_ISSUES=$(jq -n --arg id "$ISSUE_A" '{
  ($id): {number: 3449, state:"OPEN", closedAt:null, labels:[{name:"autofix"}], updatedAt:"2026-09-11T18:00:00Z"}
}')
run_sweep
assert_out_contains "skip ${ISSUE_A} (skip-handled)" "handled wave is not re-dispatched"
AUTOFIX_TEST_COMMENT_AT=""

# Cap: two create rows, third waits.
{
  row "$ISSUE_A" "2026-09-11T12:00:00Z" "a"
  row "$ISSUE_B" "2026-09-11T12:01:00Z" "b"
  row "$ISSUE_C" "2026-09-11T12:02:00Z" "c"
} >"$FIXTURE"
AUTOFIX_TEST_ISSUES='{}'
AUTOFIX_SWEEP_MAX_DISPATCHES=2
run_sweep
assert_out_contains "cap reached (2)" "sweep stops at the pending-run cap"
assert_out_contains "create #0 (${ISSUE_A})" "first uncapped row dispatches"
assert_out_contains "create #0 (${ISSUE_B})" "second uncapped row dispatches"
assert_out_not_contains "${ISSUE_C})" "third row is left for the next hour"

# Fingerprint in the GitHub body, UUID not present: still a match.
FP="deadbeeffingerprint"
row "$ISSUE_A" "2026-09-11T12:00:00Z" "UnhandledRejection" "$FP" >"$FIXTURE"
AUTOFIX_TEST_ISSUES=$(jq -n --arg id "$FP" '{
  ($id): {number: 2829, state:"CLOSED", closedAt:"2026-08-01T00:00:00Z", labels:[], updatedAt:"2026-08-01T00:00:00Z"}
}')
run_sweep
assert_out_contains "recurrence #2829 (${ISSUE_A})" "fingerprint-only GitHub body still matches"

# Open unlabeled issue: dispatch.
row "$ISSUE_A" "2026-09-11T12:00:00Z" "PROVIDER_FAILURE" >"$FIXTURE"
AUTOFIX_TEST_ISSUES=$(jq -n --arg id "$ISSUE_A" '{
  ($id): {number: 2912, state:"OPEN", closedAt:null, labels:[], updatedAt:"2026-09-10T00:00:00Z"}
}')
run_sweep
assert_out_contains "unlabeled #2912 (${ISSUE_A})" "unlabeled open issue is dispatched"

if [ "$FAIL" -ne 0 ]; then
  echo "FAILED ${FAIL}  passed ${PASS}" >&2
  exit 1
fi
echo "passed ${PASS}"
