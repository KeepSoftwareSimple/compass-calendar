#!/usr/bin/env bash
# Local assertions for autofix-unstick.sh.
# Run: bash .github/scripts/autofix-unstick.test.sh
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT"

PASS=0
FAIL=0

STUB_DIR=$(mktemp -d)
GH_LOG=$(mktemp)
trap 'rm -rf "$STUB_DIR" "$GH_LOG"' EXIT

cat >"${STUB_DIR}/gh" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${AUTOFIX_TEST_GH_LOG}"
exit 0
STUB
chmod +x "${STUB_DIR}/gh"

run_unstick() {
  : >"$GH_LOG"
  PATH="${STUB_DIR}:${PATH}" \
    GH_REPO="example/compass" \
    AUTOFIX_TEST_GH_LOG="$GH_LOG" \
    AUTOFIX_RETRY_ATTEMPT="${AUTOFIX_RETRY_ATTEMPT:-0}" \
    GITHUB_RUN_URL="https://example.test/run/1" \
    bash "${ROOT}/.github/scripts/autofix-unstick.sh" 42 >/dev/null
}

assert_gh_contains() {
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

assert_gh_not_contains() {
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

AUTOFIX_RETRY_ATTEMPT=0
run_unstick
assert_gh_contains "--remove-label autofix" "first failure removes autofix"
assert_gh_contains "--add-label autofix:failed" "first failure adds failed"
assert_gh_contains "issue comment" "first failure comments"
assert_gh_contains "workflow run" "first failure dispatches a retry"
assert_gh_contains "retry=true" "retry dispatch sets retry=true"
assert_gh_not_contains "autofix:needs-human" "first failure does not yet need a human"

AUTOFIX_RETRY_ATTEMPT=1
run_unstick
assert_gh_contains "autofix:needs-human" "second failure flags needs-human"
assert_gh_not_contains "workflow run" "second failure does not dispatch again"

if [ "$FAIL" -ne 0 ]; then
  echo "FAILED ${FAIL}  passed ${PASS}" >&2
  exit 1
fi
echo "passed ${PASS}"
