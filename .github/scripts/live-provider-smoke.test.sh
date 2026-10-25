#!/usr/bin/env bash
# Local assertions for live-provider-smoke.sh expected-provider behavior.
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
  if grep -Fq -- "$needle" <<<"$haystack"; then
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
  if grep -Fq -- "$needle" <<<"$haystack"; then
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
  local log=$2
  shift 2
  env -i \
    PATH="${STUB_DIR}/bin:/usr/bin:/bin" \
    HOME="$STUB_DIR" \
    GITHUB_STEP_SUMMARY="$summary" \
    SMOKE_TEST_BUN_LOG="${STUB_DIR}/bun.log" \
    SMOKE_TEST_BUN_EXIT="${SMOKE_TEST_BUN_EXIT:-0}" \
    "$@" \
    bash "${ROOT}/.github/scripts/live-provider-smoke.sh" >"$log" 2>&1
}

# 1. Expected provider missing creds fails; unexpected providers skip.
: > "${STUB_DIR}/bun.log"
summary="${STUB_DIR}/expected-missing.md"
log="${STUB_DIR}/expected-missing.log"
set +e
run_smoke "$summary" "$log" SMOKE_EXPECTED_PROVIDERS=microsoft,apple
status=$?
set -e
out=$(cat "$log")
assert_eq "$status" "1" "expected missing creds exits 1"
assert_contains "$out" "::warning::google skipped:" "expected-missing skips google"
assert_contains "$out" "::error::microsoft failed:" "expected-missing errors on microsoft"
assert_contains "$out" "::error::apple failed:" "expected-missing errors on apple"
assert_contains "$out" "live-provider-smoke passed=none skipped=google failed=microsoft apple" \
  "expected-missing prints the summary line"
assert_not_contains "$(cat "${STUB_DIR}/bun.log" 2>/dev/null || true)" "LIVE_PROVIDER=" \
  "expected-missing does not run bun"

# 2. Ready expected providers run; others skip when not expected.
: > "${STUB_DIR}/bun.log"
summary="${STUB_DIR}/microsoft-apple-ready.md"
log="${STUB_DIR}/microsoft-apple-ready.log"
set +e
run_smoke "$summary" "$log" \
  SMOKE_EXPECTED_PROVIDERS=microsoft,apple \
  SMOKE_MICROSOFT_REFRESH_TOKEN=rt \
  MICROSOFT_CLIENT_ID=id \
  MICROSOFT_CLIENT_SECRET=secret \
  SMOKE_APPLE_EMAIL=apple@test.example \
  SMOKE_APPLE_APP_PASSWORD=app-pass
status=$?
set -e
out=$(cat "$log")
assert_eq "$status" "0" "expected ready providers exit 0 when bun passes"
assert_contains "$out" "::warning::google skipped:" "microsoft-apple-ready skips google"
assert_not_contains "$out" "::error::microsoft failed:" "ready microsoft is not a setup failure"
assert_not_contains "$out" "::error::apple failed:" "ready apple is not a setup failure"
assert_contains "$out" "microsoft: pass" "microsoft-apple-ready microsoft contract passes"
assert_contains "$out" "apple: pass" "microsoft-apple-ready apple contract passes"
assert_contains "$out" "live-provider-smoke passed=microsoft apple skipped=google failed=none" \
  "microsoft-apple-ready summary lists passed and skipped"
assert_contains "$(cat "${STUB_DIR}/bun.log")" "LIVE_PROVIDER=microsoft" \
  "microsoft-apple-ready invokes bun for microsoft"
assert_contains "$(cat "${STUB_DIR}/bun.log")" "LIVE_PROVIDER=apple" \
  "microsoft-apple-ready invokes bun for apple"

# 3. Nothing expected: every provider skipped exits 0.
: > "${STUB_DIR}/bun.log"
summary="${STUB_DIR}/nothing-expected.md"
log="${STUB_DIR}/nothing-expected.log"
set +e
run_smoke "$summary" "$log"
status=$?
set -e
out=$(cat "$log")
assert_eq "$status" "0" "nothing expected and all skipped exits 0"
assert_contains "$out" "::warning::google skipped:" "nothing-expected warns on google"
assert_contains "$out" "::warning::microsoft skipped:" "nothing-expected warns on microsoft"
assert_contains "$out" "::warning::apple skipped:" "nothing-expected warns on apple"
assert_contains "$out" "live-provider-smoke passed=none skipped=google microsoft apple failed=none" \
  "nothing-expected prints the summary line"
assert_not_contains "$out" "::error::" "nothing expected does not error on skipped providers"

if [ "$FAIL" -gt 0 ]; then
  echo "${FAIL} failed, ${PASS} passed" >&2
  exit 1
fi
echo "${PASS} passed"
