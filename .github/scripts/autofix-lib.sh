#!/usr/bin/env bash
# Shared helpers for the error-autofix scripts. Source, don't execute:
#   SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
#   source "$SCRIPT_DIR/autofix-lib.sh"
REPO=${GH_REPO:-${GITHUB_REPOSITORY:-}}
AUTOFIX_SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

notify() {
  "$AUTOFIX_SCRIPT_DIR/discord-notify.sh" "$1" || true
}

iso_to_epoch() {
  date -u -d "$1" +%s 2>/dev/null || date -u -d "${1%.*}Z" +%s
}

now_epoch() {
  date -u +%s
}

# Best-effort: `gh issue edit --add-label` fails if the label does not exist
# yet. Creating it is a no-op when it already does.
ensure_label() {
  local name=${1:?}
  local color=${2:-B60205}
  local description=${3:-}
  gh label create "$name" --repo "$REPO" --color "$color" \
    --description "$description" >/dev/null 2>&1 || true
}

# PostHog error-tracking issue ids look like UUIDs in GitHub issue bodies
# (sweep writes "PostHog issue: <uuid>"; some alerts embed it in the URL).
extract_posthog_issue_uuid() {
  grep -oiE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' |
    head -n1 || true
}

# After a code-bug GitHub issue is fixed, resolve the linked PostHog issue
# so a later recurrence fires $error_tracking_issue_reopened instead of
# silent volume on an active issue. Ops/unknown buckets never reach here.
resolve_linked_posthog_issue() {
  local number=$1
  local key=${POSTHOG_PERSONAL_API_KEY:-}
  local host=${POSTHOG_HOST:-https://us.posthog.com}
  local project=${AUTOFIX_POSTHOG_PROJECT_ID:-165441}
  if [ -z "$key" ]; then
    printf 'POSTHOG_PERSONAL_API_KEY unset; skip resolving PostHog for #%s\n' "$number"
    return 0
  fi
  local body uuid
  body=$(gh issue view "$number" --repo "$REPO" --json body --jq '.body' 2>/dev/null)
  uuid=$(printf '%s' "$body" | extract_posthog_issue_uuid)
  if [ -z "$uuid" ]; then
    printf 'no PostHog issue UUID in #%s body; skip resolve\n' "$number"
    return 0
  fi
  curl -fsS -X PATCH \
    -H "Authorization: Bearer ${key}" \
    -H "Content-Type: application/json" \
    -d '{"status":"resolved"}' \
    "${host}/api/projects/${project}/error_tracking/issues/${uuid}/" \
    >/dev/null || {
    printf 'failed to resolve PostHog issue %s for GitHub #%s\n' "$uuid" "$number" >&2
    return 1
  }
  printf 'resolved PostHog issue %s for GitHub #%s\n' "$uuid" "$number"
}
