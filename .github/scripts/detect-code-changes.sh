#!/usr/bin/env bash
set -euo pipefail

event_name=${1:?usage: detect-code-changes.sh <event-name> <repository> [pull-request-number]}
repository=${2:?usage: detect-code-changes.sh <event-name> <repository> [pull-request-number]}
pull_request_number=${3:-}

# Path → workflow matrix (pull_request only; merge_group and push use all_on):
#
#   docs / *.md only          → unit + e2e skipped (required rollups still Success)
#   apps/calendar-macos/**    → macos workflow only (test-macos.yml job gate)
#   apps/calendar-web/**      → unit static (scoped), web legs, e2e
#   apps/booking-web/**       → unit static (scoped); e2e skipped (Playwright boots calendar-web)
#   packages/backend|sync|scripts/** → unit static (scoped), matching legs; e2e skipped
#   packages/core, root lockfile/package.json/tsconfig* → every unit leg + e2e + static_web + contracts
#
# code: TS/CI-relevant changes (excludes docs and apps/calendar-macos/**).
# e2e:  Playwright-reachable changes (excludes backend, sync, scripts, macos, booking-web).
# static_web: web boot-size budget and other web-blast-radius static work.
# contracts: bun cli contracts:swift --check (core schemas or swift-contracts emitter).
# core/web/backend/sync/scripts: unit-leg filters. packages/core, root package.json,
#       bun.lock, or root tsconfig* turn every leg on. merge_group and push always run
#       everything, so nothing reaches main untested.
write_outputs() {
  {
    printf 'code=%s\n' "$1"
    printf 'e2e=%s\n' "$2"
    printf 'core=%s\n' "$3"
    printf 'web=%s\n' "$4"
    printf 'backend=%s\n' "$5"
    printf 'sync=%s\n' "$6"
    printf 'scripts=%s\n' "$7"
    printf 'static_web=%s\n' "$8"
    printf 'contracts=%s\n' "$9"
  } >>"$GITHUB_OUTPUT"
  printf 'Non-docs changes: %s\nE2E-reachable changes: %s\nUnit packages: core=%s web=%s backend=%s sync=%s scripts=%s\nStatic web blast: %s\nSwift contracts: %s\n' \
    "$1" "$2" "$3" "$4" "$5" "$6" "$7" "$8" "$9"
}

all_on() {
  write_outputs true true true true true true true true true
}

all_off() {
  write_outputs false false false false false false false false false
}

if [ "$event_name" != "pull_request" ]; then
  all_on
  exit 0
fi

: "${pull_request_number:?pull request number is required}"

if ! files=$(gh api --paginate \
  "repos/${repository}/pulls/${pull_request_number}/files" \
  --jq '.[].filename'); then
  echo "Could not read pull request files; running checks." >&2
  all_on
  exit 0
fi

# Drain the full list instead of using grep -q, which can make pipefail treat
# printf's SIGPIPE as a failure on large pull requests.
code_files=$(printf '%s\n' "$files" |
  grep -vE '(\.md$|^docs/|^\.gitignore$)' || true)

# An empty response is unverified, so run the checks.
if [ -z "$files" ]; then
  all_on
  exit 0
fi

if [ -z "$code_files" ]; then
  all_off
  exit 0
fi

# Native desktop Swift sources are validated in test-macos.yml, not lint/knip/e2e.
ts_code_files=$(printf '%s\n' "$code_files" |
  grep -vE '^apps/calendar-macos/' || true)

if [ -z "$ts_code_files" ]; then
  all_off
  exit 0
fi

e2e_files=$(printf '%s\n' "$ts_code_files" |
  grep -vE '^packages/(backend|sync|scripts)/|^apps/booking-web/' || true)

code=true
e2e=false
[ -n "$e2e_files" ] && e2e=true

all_units_files=$(printf '%s\n' "$ts_code_files" |
  grep -E '^(packages/core(/|$)|package\.json$|bun\.lock$|tsconfig[^/]*\.json$)' || true)
web_files=$(printf '%s\n' "$ts_code_files" | grep -E '^apps/calendar-web(/|$)' || true)
backend_files=$(printf '%s\n' "$ts_code_files" | grep -E '^packages/backend(/|$)' || true)
sync_files=$(printf '%s\n' "$ts_code_files" | grep -E '^packages/sync(/|$)' || true)
scripts_files=$(printf '%s\n' "$ts_code_files" | grep -E '^packages/scripts(/|$)' || true)
static_web_files=$(printf '%s\n' "$ts_code_files" |
  grep -E '^(apps/calendar-web(/|$)|\.github/perf/)' || true)
swift_contract_files=$(printf '%s\n' "$ts_code_files" |
  grep -E '^packages/scripts/src/swift-contracts/' || true)

core=false
web=false
backend=false
sync=false
scripts=false
static_web=false
contracts=false

if [ -n "$all_units_files" ]; then
  core=true
  web=true
  backend=true
  sync=true
  scripts=true
  static_web=true
  contracts=true
else
  [ -n "$web_files" ] && web=true
  [ -n "$backend_files" ] && backend=true
  [ -n "$sync_files" ] && sync=true
  [ -n "$scripts_files" ] && scripts=true
  [ -n "$static_web_files" ] && static_web=true
  [ -n "$swift_contract_files" ] && contracts=true
fi

write_outputs "$code" "$e2e" "$core" "$web" "$backend" "$sync" "$scripts" "$static_web" "$contracts"
