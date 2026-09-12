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

# 1. Stale, unlabeled PR: escalated, labeled, notified.
AUTOFIX_TEST_PRS=$(jq -nc --arg created "$(iso_ago_minutes 90)" \
  '[{number:3655,createdAt:$created,url:"https://github.com/example/compass/pull/3655",labels:[]}]')
AUTOFIX_MODE="merge"
run_watchdog
assert_out_contains "Autofix PR #3655 has been open" "stale unlabeled PR is escalated"
assert_out_contains "needs a merge decision" "merge mode uses the merge-decision tail"
assert_log_contains "pr edit 3655 --repo example/compass --add-label autofix:needs-human" "label add is issued for the stale PR"
assert_eq "$WATCHDOG_EXIT" "0" "successful escalation exits 0"

# 2. Stale PR already carrying automerge-candidate: skipped.
AUTOFIX_TEST_PRS=$(jq -nc --arg created "$(iso_ago_minutes 90)" \
  '[{number:3450,createdAt:$created,url:"https://github.com/example/compass/pull/3450",labels:[{name:"autofix"},{name:"automerge-candidate"}]}]')
run_watchdog
assert_out_contains "escalated 0" "PR with automerge-candidate is not escalated"
assert_log_not_contains "pr edit 3450" "no label edit issued for automerge-candidate PR"

# 3. Stale PR already carrying autofix:needs-human: skipped (no re-notify).
AUTOFIX_TEST_PRS=$(jq -nc --arg created "$(iso_ago_minutes 90)" \
  '[{number:3444,createdAt:$created,url:"https://github.com/example/compass/pull/3444",labels:[{name:"autofix"},{name:"autofix:needs-human"}]}]')
run_watchdog
assert_out_contains "escalated 0" "already-escalated PR is not re-escalated"
assert_log_not_contains "pr edit 3444" "no label edit issued for already-escalated PR"

# 4. PR within grace period: skipped.
AUTOFIX_TEST_PRS=$(jq -nc --arg created "$(iso_ago_minutes 5)" \
  '[{number:3700,createdAt:$created,url:"https://github.com/example/compass/pull/3700",labels:[]}]')
run_watchdog
assert_out_contains "escalated 0" "fresh PR within grace period is not escalated"
assert_log_not_contains "pr edit 3700" "no label edit issued for fresh PR"

# 5. pr-mode tail wording differs from merge-mode.
AUTOFIX_TEST_PRS=$(jq -nc --arg created "$(iso_ago_minutes 90)" \
  '[{number:3701,createdAt:$created,url:"https://github.com/example/compass/pull/3701",labels:[]}]')
AUTOFIX_MODE="pr"
run_watchdog
assert_out_contains "waiting for manual merge; flagging since it's stale" "pr mode uses the waiting-for-merge tail"
AUTOFIX_MODE="merge"

# 6. gh pr edit fails for one PR but a second PR still gets escalated.
AUTOFIX_TEST_PRS=$(jq -nc --arg a "$(iso_ago_minutes 90)" --arg b "$(iso_ago_minutes 120)" \
  '[{number:3702,createdAt:$a,url:"https://github.com/example/compass/pull/3702",labels:[]},
    {number:3703,createdAt:$b,url:"https://github.com/example/compass/pull/3703",labels:[]}]')
AUTOFIX_TEST_EDIT_FAIL_FOR="3702"
run_watchdog
assert_out_contains "failed to apply autofix:needs-human label" "failed label edit is surfaced in the notify text"
assert_out_contains "Autofix PR #3703 has been open" "second PR is still escalated after the first fails"
assert_eq "$WATCHDOG_EXIT" "1" "a label-edit failure makes the run exit non-zero"
AUTOFIX_TEST_EDIT_FAIL_FOR=""

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
