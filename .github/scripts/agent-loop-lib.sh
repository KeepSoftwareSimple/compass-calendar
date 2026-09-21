#!/usr/bin/env bash
# Shared helpers for the agent-loop scripts. Source, don't execute:
#   source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/agent-loop-lib.sh"
# shellcheck disable=SC2034 # sourced constants consumed by sibling scripts
REPO=${GH_REPO:-${GITHUB_REPOSITORY:-}}
AGENT_LOOP_SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
STAGING_URL="${AGENT_LOOP_STAGING_URL:-https://staging.compasscalendar.com}"
RUNNING_LABEL="agent-loop-running"
QUOTA_WAITING_LABEL="agent-loop-waiting-for-credits"
NEEDS_HUMAN_LABEL="agent-loop-needs-human"
AUTOMERGE_LABEL="agent-automerge"
QUOTA_RETRY_MARKER="agent-loop-quota-retry-at="
COMMENT_PREFIX="agent-loop:"
READY_LABEL="agent-ready"

ALLOWLIST_DIR="${AGENT_LOOP_SCRIPT_DIR}/../agent-loop/allowlists"

set_output() {
  local key=$1
  local value=$2
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    printf '%s=%s\n' "$key" "$value" >>"$GITHUB_OUTPUT"
  fi
}

notify() {
  local message=$1
  if [ -x "${AGENT_LOOP_SCRIPT_DIR}/discord-notify.sh" ]; then
    "${AGENT_LOOP_SCRIPT_DIR}/discord-notify.sh" "$message" || true
  fi
}

github_repo_url() {
  printf 'https://github.com/%s' "$REPO"
}

gh() {
  if [ -n "${GH_STUB:-}" ]; then
    "$GH_STUB" "$@"
  else
    command gh "$@"
  fi
}

# Ordered milestone titles from AGENT_LOOP_MILESTONES. One title per line
# when the value has newlines (titles may then contain commas, e.g.
# "Email-ready v1: reconnect, realtime, signal"); a single line splits on
# commas. Empty input is fail-closed: the picker idles.
parse_milestones() {
  local raw="${AGENT_LOOP_MILESTONES:-}"
  if [ -z "$raw" ]; then
    return 0
  fi
  local lines
  if [[ "$raw" == *$'\n'* ]]; then
    lines=$(printf '%s\n' "$raw")
  else
    lines=$(printf '%s\n' "$raw" | tr ',' '\n')
  fi
  printf '%s\n' "$lines" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' | grep -v '^$' || true
}

# "Providers L: loop + CI acceleration" -> "providers-l"
milestone_slug() {
  local title=$1
  local head="${title%%:*}"
  printf '%s' "$head" \
    | tr '[:upper:]' '[:lower:]' \
    | sed -E 's/[^a-z0-9.]+/-/g; s/^-+//; s/-+$//'
}

# Concatenate two JSON arrays. Payloads go through a pipe, not argv/env,
# because issue bodies across a milestone can exceed ARG_MAX.
json_concat() {
  local a=${1:-[]}
  local b=${2:-[]}
  if [ -z "$a" ]; then a='[]'; fi
  if [ -z "$b" ]; then b='[]'; fi
  {
    printf '%s' "$a"
    printf '\0'
    printf '%s' "$b"
  } | python3 -c 'import json,sys
raw = sys.stdin.buffer.read()
a, b = raw.split(b"\0", 1)
print(json.dumps(json.loads(a or b"[]") + json.loads(b or b"[]")))'
}

issue_numbers_from_json() {
  python3 -c 'import json,sys
for issue in json.loads(sys.stdin.read() or "[]"):
    print(issue["number"])'
}

prompt_path_for_milestone() {
  local title=$1
  local prompt_dir="${AGENT_LOOP_SCRIPT_DIR}/../prompts"
  local slug
  slug=$(milestone_slug "$title")
  if [ -n "$slug" ] && [ -f "${prompt_dir}/${slug}.md" ]; then
    printf '%s' "${prompt_dir}/${slug}.md"
  else
    printf '%s' "${prompt_dir}/agent-loop.md"
  fi
}

allowlist_file_for_slug() {
  local slug=$1
  printf '%s/%s.txt' "$ALLOWLIST_DIR" "$slug"
}

# Print allowlist regexes (comments and blanks stripped) for a milestone slug.
read_allowlist_patterns() {
  local slug=$1
  local file
  file=$(allowlist_file_for_slug "$slug")
  if [ ! -f "$file" ]; then
    return 0
  fi
  grep -vE '^[[:space:]]*(#|$)' "$file" || true
}

file_matches_patterns() {
  local path=$1
  shift
  local pattern
  for pattern in "$@"; do
    [ -n "$pattern" ] || continue
    if printf '%s\n' "$path" | grep -Eq "$pattern"; then
      return 0
    fi
  done
  return 1
}
