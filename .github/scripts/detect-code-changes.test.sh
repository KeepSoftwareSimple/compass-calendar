#!/usr/bin/env bash
# Local assertions for detect-code-changes.sh package routing.
# Run: bash .github/scripts/detect-code-changes.test.sh
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT"

PASS=0
FAIL=0

STUB_DIR=$(mktemp -d)
OUTPUT=$(mktemp)
trap 'rm -rf "$STUB_DIR" "$OUTPUT" "${OUTPUT}.want"' EXIT

cat >"${STUB_DIR}/gh" <<'STUB'
#!/usr/bin/env bash
set -euo pipefail
printf '%s' "${DETECT_CODE_CHANGES_TEST_FILES:-}"
STUB
chmod +x "${STUB_DIR}/gh"

run_detector() {
  local event=$1
  local files=${2-}
  : >"$OUTPUT"
  DETECT_CODE_CHANGES_TEST_FILES=$files \
    GITHUB_OUTPUT=$OUTPUT \
    PATH="${STUB_DIR}:${PATH}" \
    bash .github/scripts/detect-code-changes.sh "$event" example/compass 42 >/dev/null
}

assert_output() {
  local want=$1
  local name=$2
  local want_file="${OUTPUT}.want"
  printf '%s' "$want" >"$want_file"
  if cmp -s "$OUTPUT" "$want_file"; then
    echo "ok ${name}"
    PASS=$((PASS + 1))
  else
    echo "FAIL ${name}:" >&2
    diff -u "$want_file" "$OUTPUT" >&2 || true
    FAIL=$((FAIL + 1))
  fi
}

ALL_ON=$'code=true\ne2e=true\ncore=true\nweb=true\nbackend=true\nsync=true\nscripts=true\nstatic_web=true\ncontracts=true\n'
ALL_OFF=$'code=false\ne2e=false\ncore=false\nweb=false\nbackend=false\nsync=false\nscripts=false\nstatic_web=false\ncontracts=false\n'

run_detector push
assert_output "$ALL_ON" "push runs every check"
run_detector merge_group
assert_output "$ALL_ON" "merge_group runs every check"
run_detector pull_request $'.gitignore\ndocs/testing.md\nREADME.md'
assert_output "$ALL_OFF" "docs-only PR skips every check"
run_detector pull_request 'apps/calendar-macos/Sources/App.swift'
assert_output "$ALL_OFF" "macos-only PR skips unit and e2e"
run_detector pull_request $'apps/calendar-macos/Foo.swift\napps/calendar-web/src/app.tsx'
assert_output $'code=true\ne2e=true\ncore=false\nweb=true\nbackend=false\nsync=false\nscripts=false\nstatic_web=true\ncontracts=false\n' \
  "mixed web and macos runs web and e2e"
run_detector pull_request 'packages/backend/src/app.ts'
assert_output $'code=true\ne2e=false\ncore=false\nweb=false\nbackend=true\nsync=false\nscripts=false\nstatic_web=false\ncontracts=false\n' \
  "backend-only PR skips e2e and other unit legs"
run_detector pull_request 'apps/calendar-web/src/app.tsx'
assert_output $'code=true\ne2e=true\ncore=false\nweb=true\nbackend=false\nsync=false\nscripts=false\nstatic_web=true\ncontracts=false\n' \
  "web-only PR runs web and e2e"
run_detector pull_request 'packages/core/src/types.ts'
assert_output "$ALL_ON" "core PR runs every unit leg"
run_detector pull_request 'bun.lock'
assert_output "$ALL_ON" "lockfile PR runs every unit leg"
run_detector pull_request 'tsconfig.json'
assert_output "$ALL_ON" "root tsconfig PR runs every unit leg"
run_detector pull_request 'apps/calendar-web/tsconfig.json'
assert_output $'code=true\ne2e=true\ncore=false\nweb=true\nbackend=false\nsync=false\nscripts=false\nstatic_web=true\ncontracts=false\n' \
  "nested tsconfig does not turn every leg on"

# Every apps/* tree must be classified in detect-code-changes.sh (web, macos skip, or e2e skip).
for app in apps/*/; do
  app=${app%/}
  name=${app#apps/}
  case "$name" in
    calendar-web)
      run_detector pull_request "${app}/src/x.ts"
      assert_output $'code=true\ne2e=true\ncore=false\nweb=true\nbackend=false\nsync=false\nscripts=false\nstatic_web=true\ncontracts=false\n' \
        "apps/${name} is wired for web CI"
      ;;
    calendar-macos)
      run_detector pull_request "${app}/Sources/x.swift"
      assert_output "$ALL_OFF" "apps/${name} is macos-only (skips unit/e2e)"
      ;;
    booking-web)
      run_detector pull_request "${app}/src/x.ts"
      assert_output $'code=true\ne2e=false\ncore=false\nweb=false\nbackend=false\nsync=false\nscripts=false\nstatic_web=false\ncontracts=false\n' \
        "apps/${name} runs static but skips e2e"
      ;;
    *)
      echo "FAIL unknown apps/${name}: extend detect-code-changes.sh and this loop" >&2
      FAIL=$((FAIL + 1))
      ;;
  esac
done

echo
echo "${PASS} passed, ${FAIL} failed"
if [ "$FAIL" -ne 0 ]; then
  exit 1
fi
