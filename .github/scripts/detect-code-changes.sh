#!/usr/bin/env bash
set -euo pipefail

event_name=${1:?usage: detect-code-changes.sh <event-name> <repository> [pull-request-number]}
repository=${2:?usage: detect-code-changes.sh <event-name> <repository> [pull-request-number]}
pull_request_number=${3:-}

# code: anything outside docs, so static (lint, knip, type-check) runs.
# e2e:  anything the Playwright suite can observe. The suite boots the web
#       dev server (apps/calendar-web, which imports only packages/core) against
#       stubbed routes; packages/backend, packages/sync, and packages/scripts
#       are never loaded, so a PR that touches only those skips the e2e
#       shards.
# core/web/backend/sync/scripts: unit-leg filters. packages/core, root
#       package.json, bun.lock, or root tsconfig* turn every leg on.
#       Otherwise only the packages the PR touched run. merge_group and
#       push always run everything, so nothing reaches main untested.
write_outputs() {
  {
    printf 'code=%s\n' "$1"
    printf 'e2e=%s\n' "$2"
    printf 'core=%s\n' "$3"
    printf 'web=%s\n' "$4"
    printf 'backend=%s\n' "$5"
    printf 'sync=%s\n' "$6"
    printf 'scripts=%s\n' "$7"
  } >>"$GITHUB_OUTPUT"
  printf 'Non-docs changes: %s\nE2E-reachable changes: %s\nUnit packages: core=%s web=%s backend=%s sync=%s scripts=%s\n' \
    "$1" "$2" "$3" "$4" "$5" "$6" "$7"
}

all_on() {
  write_outputs true true true true true true true
}

all_off() {
  write_outputs false false false false false false false
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
e2e_files=$(printf '%s\n' "$code_files" |
  grep -vE '^packages/(backend|sync|scripts)/' || true)

# An empty response is unverified, so run the checks.
if [ -z "$files" ]; then
  all_on
  exit 0
fi

if [ -z "$code_files" ]; then
  all_off
  exit 0
fi

code=true
e2e=false
[ -n "$e2e_files" ] && e2e=true

all_units_files=$(printf '%s\n' "$code_files" |
  grep -E '^(packages/core(/|$)|package\.json$|bun\.lock$|tsconfig[^/]*\.json$)' || true)
web_files=$(printf '%s\n' "$code_files" | grep -E '^apps/calendar-web(/|$)' || true)
backend_files=$(printf '%s\n' "$code_files" | grep -E '^packages/backend(/|$)' || true)
sync_files=$(printf '%s\n' "$code_files" | grep -E '^packages/sync(/|$)' || true)
scripts_files=$(printf '%s\n' "$code_files" | grep -E '^packages/scripts(/|$)' || true)

core=false
web=false
backend=false
sync=false
scripts=false

if [ -n "$all_units_files" ]; then
  core=true
  web=true
  backend=true
  sync=true
  scripts=true
else
  [ -n "$web_files" ] && web=true
  [ -n "$backend_files" ] && backend=true
  [ -n "$sync_files" ] && sync=true
  [ -n "$scripts_files" ] && scripts=true
fi

write_outputs "$code" "$e2e" "$core" "$web" "$backend" "$sync" "$scripts"
