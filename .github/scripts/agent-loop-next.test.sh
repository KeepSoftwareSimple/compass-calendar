#!/usr/bin/env bash
# Local assertions for agent-loop-next.sh milestone ordering and concurrency.
# Run: bash .github/scripts/agent-loop-next.test.sh
# Also invoked from packages/scripts/src/testing/agent-loop-next.test.ts.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT"

PASS=0
FAIL=0
assert_eq() {
  local got=$1
  local want=$2
  local name=$3
  if [ "$got" = "$want" ]; then
    echo "ok ${name}"
    PASS=$((PASS + 1))
  else
    echo "FAIL ${name}: got '${got}' want '${want}'" >&2
    FAIL=$((FAIL + 1))
  fi
}

assert_contains() {
  local haystack=$1
  local needle=$2
  local name=$3
  if printf '%s' "$haystack" | grep -Fq "$needle"; then
    echo "ok ${name}"
    PASS=$((PASS + 1))
  else
    echo "FAIL ${name}: missing '${needle}' in:${haystack}" >&2
    FAIL=$((FAIL + 1))
  fi
}

STUB_DIR=$(mktemp -d)
trap 'rm -rf "$STUB_DIR"' EXIT

write_stub() {
  cat >"${STUB_DIR}/gh" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
milestone=""
label=""
cmd=${1:-}
shift || true
if [ "$cmd" = "pr" ]; then
  printf '%s' "${STUB_PRS:-[]}"
  exit 0
fi
if [ "$cmd" = "api" ]; then
  printf '<!-- agent-loop-quota-retry-at=%s -->\n' "${STUB_RETRY_AT:-}"
  exit 0
fi
if [ "$cmd" != "issue" ]; then
  echo "unexpected gh command: $cmd $*" >&2
  exit 1
fi
sub=${1:-}
shift || true
if [ "$sub" != "list" ]; then
  echo "unexpected gh issue subcommand: $sub $*" >&2
  exit 1
fi
while [ "$#" -gt 0 ]; do
  case "$1" in
    --milestone) milestone=$2; shift 2 ;;
    --label) label=$2; shift 2 ;;
    *) shift ;;
  esac
done

key=""
case "$milestone" in
  "Providers L: loop + CI acceleration") key="L" ;;
  "Providers P0: foundation") key="P0" ;;
  "Booking v1.5") key="B" ;;
  *) key="OTHER" ;;
esac

if [ -n "$label" ]; then
  case "$label" in
    agent-loop-waiting-for-credits)
      eval "printf '%s' \"\${STUB_${key}_QUOTA:-[]}\""
      ;;
    agent-loop-running)
      eval "printf '%s' \"\${STUB_${key}_RUNNING:-[]}\""
      ;;
    *)
      printf '[]'
      ;;
  esac
  exit 0
fi

eval "printf '%s' \"\${STUB_${key}_OPEN:-[]}\""
STUB
  chmod +x "${STUB_DIR}/gh"
}

run_next() {
  write_stub
  local -a extra=()
  if [ -n "${AGENT_LOOP_CONCURRENCY:-}" ]; then
    extra+=(AGENT_LOOP_CONCURRENCY="$AGENT_LOOP_CONCURRENCY")
  fi
  env -u GITHUB_OUTPUT \
    GH_STUB="${STUB_DIR}/gh" \
    GH_REPO="example/compass" \
    AGENT_LOOP_MILESTONES="Providers L: loop + CI acceleration,Providers P0: foundation,Booking v1.5" \
    "${extra[@]}" \
    STUB_L_OPEN="${STUB_L_OPEN:-[]}" \
    STUB_P0_OPEN="${STUB_P0_OPEN:-[]}" \
    STUB_B_OPEN="${STUB_B_OPEN:-[]}" \
    STUB_L_QUOTA="${STUB_L_QUOTA:-[]}" \
    STUB_P0_QUOTA="${STUB_P0_QUOTA:-[]}" \
    STUB_B_QUOTA="${STUB_B_QUOTA:-[]}" \
    STUB_L_RUNNING="${STUB_L_RUNNING:-[]}" \
    STUB_P0_RUNNING="${STUB_P0_RUNNING:-[]}" \
    STUB_B_RUNNING="${STUB_B_RUNNING:-[]}" \
    STUB_PRS="${STUB_PRS:-[]}" \
    STUB_RETRY_AT="${STUB_RETRY_AT:-}" \
    bash "${ROOT}/.github/scripts/agent-loop-next.sh"
}

ALLOW_BODY='### Approval boundary\n\nallow\n\nDepends on: none'
HUMAN_BODY='### Approval boundary\n\nhuman\n\nDepends on: none'
DEP_BODY='### Approval boundary\n\nallow\n\nDepends on: #3236'

L_ISSUE='[{"number":3217,"title":"providers L WP","url":"https://example.test/issues/3217","labels":[{"name":"agent-ready"}],"body":"### Approval boundary\n\nallow\n\nDepends on: none"}]'
B_ISSUE='[{"number":3100,"title":"booking WP","url":"https://example.test/issues/3100","labels":[{"name":"agent-ready"}],"body":"### Approval boundary\n\nallow\n\nDepends on: none"}]'
L_RUNNING_FRESH='[{"number":3212,"updatedAt":"2099-01-01T00:00:00Z"}]'
L_QUOTA='[{"number":3217,"title":"providers L WP","url":"https://example.test/issues/3217"}]'
L_TRACKING='[{"number":3206,"title":"Providers L: tracking issue","url":"https://example.test/issues/3206","labels":[{"name":"providers-loop"}],"body":"tracking"}]'
L_HUMAN='[{"number":3213,"title":"WP-02 human","url":"https://example.test/issues/3213","labels":[{"name":"agent-ready"}],"body":"### Approval boundary\n\nhuman\n\nDepends on: none"}]'
L_ALLOW='[{"number":3222,"title":"WP-12 allow","url":"https://example.test/issues/3222","labels":[{"name":"agent-ready"}],"body":"### Approval boundary\n\nallow\n\nDepends on: none"}]'
L_DEP='[{"number":3272,"title":"WP-10 smoke","url":"https://example.test/issues/3272","labels":[{"name":"agent-ready"}],"body":"### Approval boundary\n\nallow\n\nDepends on: #3236"}]'
P0_DEP='[{"number":3236,"title":"P0 WP-11 corpus","url":"https://example.test/issues/3236","labels":[{"name":"agent-ready"}],"body":"### Approval boundary\n\nallow\n\nDepends on: none"}]'

out=$(STUB_L_OPEN="$L_ISSUE" STUB_B_OPEN="$B_ISSUE" run_next)
assert_contains "$out" "ISSUE_NUMBER=3217" "higher-priority milestone drains first"
assert_contains "$out" "ISSUE_TITLE=providers L WP" "prints title for Providers L issue"
assert_contains "$out" "ISSUE_NUMBERS=3217 3100" "fills remaining slots from later milestones"

out=$(STUB_L_OPEN='[]' STUB_B_OPEN="$B_ISSUE" run_next)
assert_contains "$out" "ISSUE_NUMBER=3100" "falls through to later milestone when first is empty"

out=$(AGENT_LOOP_CONCURRENCY=1 STUB_L_OPEN="$L_ISSUE" STUB_B_OPEN="$B_ISSUE" STUB_L_RUNNING="$L_RUNNING_FRESH" run_next)
assert_contains "$out" "found=false" "fresh running label idles when fleet is at N"
if printf '%s' "$out" | grep -q 'ISSUE_NUMBER='; then
  echo "FAIL idle run must not print ISSUE_NUMBER" >&2
  FAIL=$((FAIL + 1))
else
  echo "ok idle run omits ISSUE_NUMBER"
  PASS=$((PASS + 1))
fi

out=$(STUB_L_QUOTA="$L_QUOTA" STUB_L_OPEN="$L_ISSUE" STUB_B_OPEN="$B_ISSUE" STUB_RETRY_AT="2999-01-01T00:00:00Z" run_next)
assert_contains "$out" "found=false" "quota wait in the first milestone blocks later ones"

out=$(STUB_L_QUOTA="$L_QUOTA" STUB_RETRY_AT="2000-01-01T00:00:00Z" run_next)
assert_contains "$out" "ISSUE_NUMBER=3217" "retries quota-waiting issue after recorded time"

out=$(STUB_L_OPEN="$L_ISSUE" STUB_PRS='[{"number":1,"title":"fix","body":"Fixes #3217"}]' STUB_B_OPEN="$B_ISSUE" run_next)
assert_contains "$out" "ISSUE_NUMBER=3100" "skips issue that already has a Fixes PR"

json_cat() {
  A="$1" B="$2" python3 -c 'import json,os; print(json.dumps(json.loads(os.environ["A"])+json.loads(os.environ["B"])))'
}

out=$(STUB_L_OPEN="$(json_cat "$L_TRACKING" "$L_ALLOW")" run_next)
assert_contains "$out" "ISSUE_NUMBER=3222" "skips tracking issue without agent-ready"

out=$(STUB_L_OPEN="$(json_cat "$L_HUMAN" "$L_ALLOW")" run_next)
assert_contains "$out" "ISSUE_NUMBER=3222" "skips Approval boundary human"

out=$(STUB_L_OPEN="$(json_cat "$L_DEP" "$L_ALLOW")" STUB_P0_OPEN="$P0_DEP" run_next)
assert_contains "$out" "ISSUE_NUMBER=3222" "skips WP whose Depends on issue is still open"
if printf '%s' "$out" | grep -Eq 'ISSUE_NUMBERS=.*3272'; then
  echo "FAIL blocked WP-10 must not appear in ISSUE_NUMBERS: ${out}" >&2
  FAIL=$((FAIL + 1))
else
  echo "ok blocked WP-10 omitted from ISSUE_NUMBERS"
  PASS=$((PASS + 1))
fi

out=$(STUB_L_OPEN="$L_HUMAN" STUB_P0_OPEN="$P0_DEP" run_next)
assert_contains "$out" "ISSUE_NUMBER=3236" "human leftovers on L do not block P0"

L_DEP_CHAIN=$(python3 - <<'PY'
import json
allow = "### Approval boundary\n\nallow\n\nDepends on: none"
issues = [
  {"number": 1, "title": "one", "url": "https://example.test/issues/1",
   "labels": [{"name": "agent-ready"}], "body": allow},
  {"number": 2, "title": "two", "url": "https://example.test/issues/2",
   "labels": [{"name": "agent-ready"}],
   "body": "### Approval boundary\n\nallow\n\nDepends on: #1"},
  {"number": 3, "title": "three", "url": "https://example.test/issues/3",
   "labels": [{"name": "agent-ready"}], "body": allow},
]
print(json.dumps(issues))
PY
)
out=$(STUB_L_OPEN="$L_DEP_CHAIN" run_next)
assert_contains "$out" "ISSUE_NUMBERS=1 3" "Depends on open issue skips 2 and still selects 1 and 3"

L_SYNC_CORE_PAIR=$(python3 - <<'PY'
import json
allow = "### Approval boundary\n\nallow\n\nDepends on: none"
issues = [
  {"number": 10, "title": "core-a", "url": "https://example.test/issues/10",
   "labels": [{"name": "agent-ready"}, {"name": "sync-core"}], "body": allow},
  {"number": 11, "title": "core-b", "url": "https://example.test/issues/11",
   "labels": [{"name": "agent-ready"}, {"name": "sync-core"}], "body": allow},
]
print(json.dumps(issues))
PY
)
out=$(AGENT_LOOP_CONCURRENCY=2 STUB_L_OPEN="$L_SYNC_CORE_PAIR" run_next)
assert_contains "$out" "ISSUE_NUMBERS=10" "overlapping sync-core labels pick only the lower number"
if printf '%s' "$out" | grep -Eq 'ISSUE_NUMBERS=.*11'; then
  echo "FAIL overlapping sync-core issue 11 must not be selected: ${out}" >&2
  FAIL=$((FAIL + 1))
else
  echo "ok overlapping sync-core issue 11 omitted"
  PASS=$((PASS + 1))
fi

L_RUNNING_CORE='[{"number":10,"updatedAt":"2099-01-01T00:00:00Z","labels":[{"name":"agent-loop-running"},{"name":"sync-core"}]}]'
L_WEB_AND_CORE=$(python3 - <<'PY'
import json
allow = "### Approval boundary\n\nallow\n\nDepends on: none"
issues = [
  {"number": 11, "title": "core-b", "url": "https://example.test/issues/11",
   "labels": [{"name": "agent-ready"}, {"name": "sync-core"}], "body": allow},
  {"number": 12, "title": "web-a", "url": "https://example.test/issues/12",
   "labels": [{"name": "agent-ready"}, {"name": "web"}], "body": allow},
]
print(json.dumps(issues))
PY
)
out=$(AGENT_LOOP_CONCURRENCY=2 STUB_L_OPEN="$L_WEB_AND_CORE" STUB_L_RUNNING="$L_RUNNING_CORE" run_next)
assert_contains "$out" "ISSUE_NUMBERS=12" "running sync-core occupies that partition so only web is launched"
if printf '%s' "$out" | grep -Eq 'ISSUE_NUMBERS=.*11'; then
  echo "FAIL running partition must block the other sync-core WP: ${out}" >&2
  FAIL=$((FAIL + 1))
else
  echo "ok running sync-core blocks the overlapping candidate"
  PASS=$((PASS + 1))
fi

out=$(
  env -u GITHUB_OUTPUT -u AGENT_LOOP_MILESTONES \
    GH_STUB="${STUB_DIR}/gh" \
    GH_REPO="example/compass" \
    bash "${ROOT}/.github/scripts/agent-loop-next.sh"
)
assert_contains "$out" "found=false" "empty AGENT_LOOP_MILESTONES idles"
assert_contains "$out" "AGENT_LOOP_MILESTONES is empty" "empty milestones prints idle reason"
if printf '%s' "$out" | grep -q 'ISSUE_NUMBER='; then
  echo "FAIL empty milestones must not print ISSUE_NUMBER" >&2
  FAIL=$((FAIL + 1))
else
  echo "ok empty milestones omit ISSUE_NUMBER"
  PASS=$((PASS + 1))
fi

# shellcheck disable=SC1091
source "${ROOT}/.github/scripts/agent-loop-lib.sh"
got=$(AGENT_LOOP_MILESTONES="A: one,B: two, C: three" parse_milestones | paste -sd'|' -)
assert_eq "$got" "A: one|B: two|C: three" "single-line milestones split on commas"
got=$(AGENT_LOOP_MILESTONES=$'Email-ready v1: reconnect, realtime, signal\nSimplify v1: one teaching surface\n' parse_milestones | paste -sd'|' -)
assert_eq "$got" "Email-ready v1: reconnect, realtime, signal|Simplify v1: one teaching surface" "multi-line milestones keep commas inside titles"

if grep -qE 'BOOKING_LOOP_|booking-loop-|booking-automerge|LEGACY_|DEFAULT_MILESTONES|Compass Booking v1' \
  "${ROOT}/.github/scripts/agent-loop-lib.sh" \
  "${ROOT}/.github/scripts/agent-loop-next.sh"; then
  echo "FAIL picker or lib still mentions booking-loop aliases or a default milestone" >&2
  FAIL=$((FAIL + 1))
else
  echo "ok picker and lib have no booking-loop aliases"
  PASS=$((PASS + 1))
fi

if grep -q 'os.environ\["A"\]' "${ROOT}/.github/scripts/agent-loop-lib.sh"; then
  echo "FAIL json_concat still passes JSON through the environment" >&2
  FAIL=$((FAIL + 1))
else
  echo "ok json_concat does not use env vars for JSON payloads"
  PASS=$((PASS + 1))
fi
if grep -q 'ISSUES_JSON=\|ALL_OPEN_JSON=' "${ROOT}/.github/scripts/agent-loop-next.sh"; then
  echo "FAIL picker still passes issue JSON through the environment" >&2
  FAIL=$((FAIL + 1))
else
  echo "ok picker reads issue JSON from files, not env"
  PASS=$((PASS + 1))
fi

# shellcheck disable=SC1091
source "${ROOT}/.github/scripts/agent-loop-lib.sh"
big=$(python3 -c 'print("[" + ",".join(["{\"n\":%d}" % i for i in range(8000)]) + "]")')
concat_out=$(json_concat "$big" "$big")
concat_len=$(printf '%s' "$concat_out" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)))')
assert_eq "$concat_len" "16000" "json_concat concatenates large arrays via a pipe"

echo
echo "passed=${PASS} failed=${FAIL}"
if [ "$FAIL" -ne 0 ]; then
  exit 1
fi
