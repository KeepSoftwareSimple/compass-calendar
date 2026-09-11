#!/usr/bin/env bash
# Local assertions for autofix-lib.sh helpers.
# Run: bash .github/scripts/autofix-lib.test.sh
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT"

PASS=0
FAIL=0

GH_REPO="example/compass"
# shellcheck source=/dev/null
source "${ROOT}/.github/scripts/autofix-lib.sh"

assert_eq() {
  local got=$1
  local want=$2
  local name=$3
  if [ "$got" = "$want" ]; then
    echo "ok ${name}"
    PASS=$((PASS + 1))
  else
    echo "FAIL ${name}: wanted '${want}', got '${got}'" >&2
    FAIL=$((FAIL + 1))
  fi
}

uuid=$(printf 'see https://us.posthog.com/project/165441/error_tracking/01a042b6-4e57-7611-9a1f-cdd9436e0ff2\n' |
  extract_posthog_issue_uuid)
assert_eq "$uuid" "01a042b6-4e57-7611-9a1f-cdd9436e0ff2" \
  "extracts UUID from a PostHog error_tracking URL"

uuid=$(printf 'PostHog issue: 01a02693-a9c0-72b0-b7f5-2ee68a0db95a\n' |
  extract_posthog_issue_uuid)
assert_eq "$uuid" "01a02693-a9c0-72b0-b7f5-2ee68a0db95a" \
  "extracts UUID from sweep issue body"

uuid=$(printf 'no identifier here\n' | extract_posthog_issue_uuid)
assert_eq "$uuid" "" "empty when the body has no UUID"

STUB_DIR=$(mktemp -d)
CURL_LOG=$(mktemp)
trap 'rm -rf "$STUB_DIR" "$CURL_LOG"' EXIT

cat >"${STUB_DIR}/gh" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "PostHog issue: 01a04156-2b7b-7580-90c0-05dc25299caa"
STUB
cat >"${STUB_DIR}/curl" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "${AUTOFIX_TEST_CURL_LOG}"
exit 0
STUB
chmod +x "${STUB_DIR}/gh" "${STUB_DIR}/curl"

PATH="${STUB_DIR}:${PATH}" \
  GH_REPO="example/compass" \
  POSTHOG_PERSONAL_API_KEY="phx_test" \
  AUTOFIX_TEST_CURL_LOG="$CURL_LOG" \
  AUTOFIX_POSTHOG_PROJECT_ID="165441" \
  POSTHOG_HOST="https://us.posthog.com" \
  resolve_linked_posthog_issue 2899 >/dev/null

if grep -Fq "error_tracking/issues/01a04156-2b7b-7580-90c0-05dc25299caa/" "$CURL_LOG"; then
  echo "ok resolve PATCHes the PostHog issue"
  PASS=$((PASS + 1))
else
  echo "FAIL resolve did not PATCH the issue: $(cat "$CURL_LOG")" >&2
  FAIL=$((FAIL + 1))
fi

if [ "$FAIL" -ne 0 ]; then
  echo "FAILED ${FAIL}  passed ${PASS}" >&2
  exit 1
fi
echo "passed ${PASS}"
