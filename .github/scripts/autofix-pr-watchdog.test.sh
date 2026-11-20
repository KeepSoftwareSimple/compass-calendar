#!/usr/bin/env bash
# Local assertions for autofix-pr-watchdog.sh.
# Run: bash .github/scripts/autofix-pr-watchdog.test.sh
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT"

PASS=0
FAIL=0

STUB_DIR=$(mktemp -d)
OUT=$(mktemp)
GH_LOG=$(mktemp)
trap 'rm -rf "$STUB_DIR" "$OUT" "$GH_LOG"' EXIT

cat >"${STUB_DIR}/gh" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${AUTOFIX_TEST_GH_LOG}"
args="$*"
if [[ "$args" == *"pr list"* ]]; then
  if [ -n "${AUTOFIX_TEST_LIST_FAIL:-}" ]; then
    echo "simulated gh pr list failure" >&2
    exit 1
  fi
  # Faithful `gh pr list` fake: answer with only the fields the caller named
  # in --json, then apply the caller's own --jq. Re-implementing the filter
  # here instead let a script that forgot to request `labels` still look like
  # it filtered on them, which is how the bug this guards reached CI.
  # `gh ... --jq` prints raw (unquoted) output for string results, same as
  # `jq -r`, which is what production relies on for `tojson`-per-line output.
  fields=""
  jq_expr="."
  while [ $# -gt 0 ]; do
    case $1 in
      --json)
        fields=$2
        shift 2
        ;;
      --jq)
        jq_expr=$2
        shift 2
        ;;
      *) shift ;;
    esac
  done
  jq -c --arg fields "$fields" \
    '($fields | split(",")) as $requested
     | [.[] | with_entries(select(.key | IN($requested[])))]' \
    <<<"${AUTOFIX_TEST_PRS:-[]}" | jq -r "$jq_expr"
  exit 0
fi
if [[ "$args" == *"pr edit"* ]]; then
  for token in "$@"; do
    if [[ "$token" == "${AUTOFIX_TEST_EDIT_FAIL_FOR:-__none__}" ]]; then
      echo "simulated gh pr edit failure" >&2
      exit 1
    fi
  done
  exit 0
fi
if [[ "$args" == *"label create"* ]]; then
  exit 0
fi
# The calls the real autofix-merge-guard.sh makes when the watchdog hands a
# PR back to it in merge mode.
if [[ "$args" == *"pr diff"* ]]; then
  printf '%s\n' ${AUTOFIX_TEST_DIFF_FILES:-a.ts b.ts}
  exit 0
fi
if [[ "$args" == *"pr view"* ]]; then
  printf '%s\n' "${AUTOFIX_TEST_LINES:-45}"
  exit 0
fi
if [[ "$args" == *"pr merge"* || "$args" == *"pr close"* ]]; then
  exit 0
fi
printf 'unexpected gh invocation: %s\n' "$args" >&2
exit 1
STUB
chmod +x "${STUB_DIR}/gh"

pr() {
  jq -nc --arg n "$1" --arg created "$2" --arg url "$3" --argjson labels "${4:-[]}" \
    '{number:($n|tonumber),createdAt:$created,url:$url,labels:$labels}'
}

NOW=$(date -u +%s)
iso_ago_minutes() {
  local epoch=$((NOW - $1 * 60))
  date -u -d "@${epoch}" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -r "${epoch}" +%Y-%m-%dT%H:%M:%SZ
}

run_watchdog() {
  # Per-run log, so a `pr edit` from an earlier case can't satisfy (or spoil)
  # this case's assertions.
  : >"$GH_LOG"
  set +e
  PATH="${STUB_DIR}:${PATH}" \
    GH_REPO="example/compass" \
    AUTOFIX_TEST_GH_LOG="$GH_LOG" \
    AUTOFIX_TEST_PRS="${AUTOFIX_TEST_PRS:-[]}" \
    AUTOFIX_TEST_EDIT_FAIL_FOR="${AUTOFIX_TEST_EDIT_FAIL_FOR:-}" \
    AUTOFIX_TEST_LIST_FAIL="${AUTOFIX_TEST_LIST_FAIL:-}" \
    AUTOFIX_TEST_LINES="${AUTOFIX_TEST_LINES:-45}" \
    AUTOFIX_WATCHDOG_GRACE_MINUTES="${AUTOFIX_WATCHDOG_GRACE_MINUTES:-60}" \
    AUTOFIX_MODE="${AUTOFIX_MODE:-}" \
    bash "${ROOT}/.github/scripts/autofix-pr-watchdog.sh" >"$OUT" 2>&1
  WATCHDOG_EXIT=$?
  set -e
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

assert_log_contains() {
  local needle=$1
  local name=$2
  if grep -Fq -- "$needle" "$GH_LOG"; then
    echo "ok ${name}"
    PASS=$((PASS + 1))
  else
    echo "FAIL ${name}: missing '${needle}' in:$(cat "$GH_LOG")" >&2
    FAIL=$((FAIL + 1))
  fi
}

assert_log_not_contains() {
  local needle=$1
  local name=$2
  if grep -Fq -- "$needle" "$GH_LOG"; then
    echo "FAIL ${name}: unexpectedly found '${needle}' in:$(cat "$GH_LOG")" >&2
    FAIL=$((FAIL + 1))
  else
    echo "ok ${name}"
    PASS=$((PASS + 1))
  fi
}

assert_eq() {
  local actual=$1 expected=$2 name=$3
  if [ "$actual" = "$expected" ]; then
    echo "ok ${name}"
    PASS=$((PASS + 1))
  else
    echo "FAIL ${name}: expected '${expected}', got '${actual}'" >&2
    FAIL=$((FAIL + 1))
  fi
}

# 1. merge mode: a stale PR without auto-merge goes back through the merge
# guard, even one an older pipeline parked with autofix:needs-human (#5323).
AUTOFIX_TEST_PRS=$(jq -nc --arg created "$(iso_ago_minutes 90)" \
  '[{number:5323,createdAt:$created,url:"https://github.com/example/compass/pull/5323",body:"Fixes #5320.",autoMergeRequest:null,labels:[{name:"autofix"},{name:"autofix:needs-human"}]}]')
AUTOFIX_MODE="merge"
run_watchdog
assert_out_contains "re-running merge guard for PR #5323 (issue #5320)" "stale PR is handed to the merge guard"
assert_log_contains "pr merge 5323 --repo example/compass --auto" "merge guard enables auto-merge"
assert_log_not_contains "needs-human" "merge mode never adds needs-human"
assert_eq "$WATCHDOG_EXIT" "0" "successful re-merge exits 0"

# 2. merge mode: a PR that already has auto-merge is left alone.
AUTOFIX_TEST_PRS=$(jq -nc --arg created "$(iso_ago_minutes 90)" \
  '[{number:3450,createdAt:$created,url:"https://github.com/example/compass/pull/3450",body:"Fixes #3449",autoMergeRequest:{enabledAt:"x"},labels:[{name:"autofix"}]}]')
run_watchdog
assert_out_contains "handled 0" "PR with auto-merge is not touched"
assert_log_not_contains "pr merge" "no merge call for a PR that already auto-merges"

# 3. merge mode: a PR over the size rails is closed, not parked for a human.
AUTOFIX_TEST_PRS=$(jq -nc --arg created "$(iso_ago_minutes 90)" \
  '[{number:3460,createdAt:$created,url:"https://github.com/example/compass/pull/3460",body:"Fixes #3459",autoMergeRequest:null,labels:[{name:"autofix"}]}]')
AUTOFIX_TEST_LINES=900
run_watchdog
assert_log_contains "pr close 3460" "oversized PR is closed"
assert_log_not_contains "pr merge" "oversized PR is not merged"
assert_log_not_contains "needs-human" "oversized PR is not labeled needs-human"
AUTOFIX_TEST_LINES=45

# 4. PR within grace period: skipped.
AUTOFIX_TEST_PRS=$(jq -nc --arg created "$(iso_ago_minutes 5)" \
  '[{number:3700,createdAt:$created,url:"https://github.com/example/compass/pull/3700",labels:[]}]')
run_watchdog
assert_out_contains "handled 0" "fresh PR within grace period is not handled"
assert_log_not_contains "pr merge" "no merge call for fresh PR"

# 5. pr mode: a human merges by design, so a stale PR is flagged once.
AUTOFIX_TEST_PRS=$(jq -nc --arg created "$(iso_ago_minutes 90)" \
  '[{number:3701,createdAt:$created,url:"https://github.com/example/compass/pull/3701",labels:[]}]')
AUTOFIX_MODE="pr"
run_watchdog
assert_out_contains "waiting for manual merge; flagging since it's stale" "pr mode flags the stale PR"
assert_log_contains "pr edit 3701 --repo example/compass --add-label autofix:needs-human" "pr mode adds needs-human"

# 5b. pr mode: an already-flagged PR is not re-notified.
AUTOFIX_TEST_PRS=$(jq -nc --arg created "$(iso_ago_minutes 90)" \
  '[{number:3444,createdAt:$created,url:"https://github.com/example/compass/pull/3444",labels:[{name:"autofix"},{name:"autofix:needs-human"}]}]')
run_watchdog
assert_out_contains "handled 0" "already-flagged PR is not re-flagged"
assert_log_not_contains "pr edit 3444" "no label edit issued for already-flagged PR"

# 6. pr mode: gh pr edit fails for one PR but a second PR still gets escalated.
AUTOFIX_TEST_PRS=$(jq -nc --arg a "$(iso_ago_minutes 90)" --arg b "$(iso_ago_minutes 120)" \
  '[{number:3702,createdAt:$a,url:"https://github.com/example/compass/pull/3702",labels:[]},
    {number:3703,createdAt:$b,url:"https://github.com/example/compass/pull/3703",labels:[]}]')
AUTOFIX_TEST_EDIT_FAIL_FOR="3702"
run_watchdog
assert_out_contains "failed to apply autofix:needs-human label" "failed label edit is surfaced in the notify text"
assert_out_contains "Autofix PR #3703 has been open" "second PR is still escalated after the first fails"
assert_eq "$WATCHDOG_EXIT" "1" "a label-edit failure makes the run exit non-zero"
AUTOFIX_TEST_EDIT_FAIL_FOR=""
AUTOFIX_MODE="merge"

# 7. `gh pr list` itself fails: nothing is escalated and the run reports it.
AUTOFIX_TEST_PRS='[]'
AUTOFIX_TEST_LIST_FAIL="1"
run_watchdog
assert_eq "$WATCHDOG_EXIT" "1" "a failed pr list makes the run exit non-zero"
assert_log_not_contains "pr edit" "no label edit is attempted when listing fails"
AUTOFIX_TEST_LIST_FAIL=""

if [ "$FAIL" -ne 0 ]; then
  echo "FAILED ${FAIL}  passed ${PASS}" >&2
  exit 1
fi
echo "passed ${PASS}"
