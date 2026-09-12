#!/usr/bin/env bash
# Local assertions for live-provider-smoke.sh expected-provider skips.
# Run: bash .github/scripts/live-provider-smoke.test.sh
# Needs bash 4+ (GitHub Actions; not macOS system bash 3).
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

assert_not_contains() {
  local haystack=$1
  local needle=$2
  local name=$3
  if printf '%s' "$haystack" | grep -Fq "$needle"; then
    echo "FAIL ${name}: unexpectedly found '${needle}' in:${haystack}" >&2
    FAIL=$((FAIL + 1))
  else
    echo "ok ${name}"
    PASS=$((PASS + 1))
  fi
}

STUB_DIR=$(mktemp -d)
trap 'rm -rf "$STUB_DIR"' EXIT
mkdir -p "${STUB_DIR}/bin"

cat >"${STUB_DIR}/bin/bun" <<'STUB'
#!/usr/bin/env bash
printf 'bun %s LIVE_PROVIDER=%s\n' "$*" "${LIVE_PROVIDER:-}" >> "${SMOKE_TEST_BUN_LOG}"
exit "${SMOKE_TEST_BUN_EXIT:-0}"
STUB
chmod +x "${STUB_DIR}/bin/bun"

run_smoke() {
  local summary=$1
  shift
  env -i \
    PATH="${STUB_DIR}/bin:/usr/bin:/bin" \
    HOME="$STUB_DIR" \
    GITHUB_STEP_SUMMARY="$summary" \
    SMOKE_TEST_BUN_LOG="${STUB_DIR}/bun.log" \
    SMOKE_TEST_BUN_EXIT="${SMOKE_TEST_BUN_EXIT:-0}" \
    "$@" \
    bash "${ROOT}/.github/scripts/live-provider-smoke.sh"
}

# 1. Expected provider skipped exits 1, warns, summarizes, and notifies.
summary="${STUB_DIR}/expected-skip.md"
set +e
out=$(
  run_smoke "$summary" SMOKE_EXPECTED_PROVIDERS=microsoft 2>&1
)
status=$?
set -e
assert_eq "$status" "1" "expected microsoft skipped exits 1"
assert_contains "$out" "::warning::google skipped:" "expected-skip still warns on google"
assert_contains "$out" "::warning::microsoft skipped:" "expected microsoft skip is a warning"
assert_contains "$out" "::warning::apple skipped:" "expected-skip still warns on apple"
assert_contains "$out" "live-provider-smoke passed=none skipped=google microsoft apple failed=none" \
  "expected-skip prints the summary line"
assert_contains "$out" "live-provider-smoke expected provider skipped: microsoft" \
  "expected skip notifies Discord with the skipped names"
assert_contains "$(cat "$summary")" \
  "live-provider-smoke passed=none skipped=google microsoft apple failed=none" \
  "expected-skip writes the summary to GITHUB_STEP_SUMMARY"
assert_not_contains "$(cat "${STUB_DIR}/bun.log" 2>/dev/null || true)" "LIVE_PROVIDER=" \
  "expected-skip does not run bun when secrets are absent"

# 2. Unexpected provider skipped exits 0 with a warning; expected provider runs.
: > "${STUB_DIR}/bun.log"
summary="${STUB_DIR}/unexpected-skip.md"
set +e
out=$(
  run_smoke "$summary" \
    SMOKE_EXPECTED_PROVIDERS=microsoft \
    SMOKE_MICROSOFT_REFRESH_TOKEN=rt \
    MICROSOFT_CLIENT_ID=id \
    MICROSOFT_CLIENT_SECRET=secret \
    2>&1
)
status=$?
set -e
assert_eq "$status" "0" "unexpected skip exits 0 when expected provider ran"
assert_contains "$out" "::warning::google skipped:" "unexpected google skip is a warning"
assert_contains "$out" "::warning::apple skipped:" "unexpected apple skip is a warning"
assert_not_contains "$out" "::warning::microsoft skipped:" "ready microsoft is not skipped"
assert_contains "$out" "live-provider-smoke passed=microsoft skipped=google apple failed=none" \
  "unexpected-skip summary lists microsoft as passed"
assert_contains "$(cat "${STUB_DIR}/bun.log")" "LIVE_PROVIDER=microsoft" \
  "ready expected provider invokes bun"
assert_contains "$(cat "$summary")" \
  "live-provider-smoke passed=microsoft skipped=google apple failed=none" \
  "unexpected-skip writes the summary to GITHUB_STEP_SUMMARY"

# 3. Nothing expected: every provider skipped still exits 0 (today's behaviour).
: > "${STUB_DIR}/bun.log"
summary="${STUB_DIR}/nothing-expected.md"
set +e
out=$(
  run_smoke "$summary" 2>&1
)
status=$?
set -e
assert_eq "$status" "0" "nothing expected and all skipped exits 0"
assert_contains "$out" "::warning::google skipped:" "nothing-expected warns on google"
assert_contains "$out" "::warning::microsoft skipped:" "nothing-expected warns on microsoft"
assert_contains "$out" "::warning::apple skipped:" "nothing-expected warns on apple"
assert_contains "$out" "live-provider-smoke passed=none skipped=google microsoft apple failed=none" \
  "nothing-expected prints the summary line"
assert_not_contains "$out" "expected provider skipped" \
  "nothing expected does not Discord-notify a skip as a failure"
assert_contains "$(cat "$summary")" \
  "live-provider-smoke passed=none skipped=google microsoft apple failed=none" \
  "nothing-expected writes the summary to GITHUB_STEP_SUMMARY"

if [ "$FAIL" -gt 0 ]; then
  echo "${FAIL} failed, ${PASS} passed" >&2
  exit 1
fi
echo "${PASS} passed"
