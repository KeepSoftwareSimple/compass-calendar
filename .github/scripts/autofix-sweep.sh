#!/usr/bin/env bash
# Hourly watchdog: find production PostHog exceptions that never got a
# successful autofix run (no GitHub issue, closed issue whose fingerprint
# fired again, or a stuck autofix:failed label) and feed them into the
# existing error-autofix workflow via workflow_dispatch. No LLM here.
set -uo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/autofix-lib.sh"

POSTHOG_HOST=${POSTHOG_HOST:-https://us.posthog.com}
POSTHOG_PROJECT_ID=${AUTOFIX_POSTHOG_PROJECT_ID:-165441}
SWEEP_WINDOW_HOURS=${AUTOFIX_SWEEP_WINDOW_HOURS:-6}
MAX_DISPATCHES=${AUTOFIX_SWEEP_MAX_DISPATCHES:-2}
WORKFLOW_FILE=${AUTOFIX_WORKFLOW_FILE:-error-autofix.yml}
DRY_RUN=${AUTOFIX_SWEEP_DRY_RUN:-0}

# GitHub keeps one pending run per concurrency group. The autofix job uses a
# single group, so a sweep that dispatched 3 would cancel the third. 2 =
# one in flight + one queued. The next hour picks up the rest.
IN_FLIGHT_MINUTES=${AUTOFIX_SWEEP_IN_FLIGHT_MINUTES:-90}

log() {
  printf '%s\n' "$*"
}

hogql_query() {
  cat <<EOF
SELECT
  toString(properties.\$exception_issue_id) AS issue_id,
  any(toString(properties.\$exception_fingerprint)) AS fingerprint,
  any(toString(properties.\$exception_values)) AS message,
  max(timestamp) AS last_seen,
  count() AS occurrences
FROM events
WHERE event = '\$exception'
  AND timestamp >= now() - INTERVAL ${SWEEP_WINDOW_HOURS} HOUR
  AND (
    properties.environment = 'production'
    OR (
      coalesce(toString(properties.environment), '') = ''
      AND position(lower(coalesce(properties.\$host, '')), 'staging') = 0
      AND position(lower(coalesce(properties.\$host, '')), 'localhost') = 0
    )
  )
  AND notEmpty(toString(properties.\$exception_issue_id))
GROUP BY issue_id
ORDER BY last_seen DESC
LIMIT 50
EOF
}

fetch_exceptions() {
  if [ -n "${AUTOFIX_SWEEP_FIXTURE:-}" ]; then
    cat "$AUTOFIX_SWEEP_FIXTURE"
    return 0
  fi
  if [ -z "${POSTHOG_PERSONAL_API_KEY:-}" ]; then
    printf 'POSTHOG_PERSONAL_API_KEY unset; sweep cannot query PostHog\n' >&2
    return 1
  fi
  local query json body
  query=$(hogql_query)
  json=$(jq -n --arg q "$query" '{query:{kind:"HogQLQuery",query:$q}}')
  body=$(curl -fsS \
    -H "Authorization: Bearer ${POSTHOG_PERSONAL_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$json" \
    "${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query/")
  jq -c '
    (.results // .query.results // [])
    | if length == 0 then [] else
        if (.[0] | type) == "array" then
          map({
            issue_id: .[0],
            fingerprint: .[1],
            message: .[2],
            last_seen: .[3],
            occurrences: .[4]
          })
        else . end
      end
    | .[]
  ' <<<"$body"
}

title_from_message() {
  local raw=$1
  printf '%s' "$raw" | tr '\n' ' ' | cut -c1-80
}

search_github_issue() {
  local query=$1
  [ -n "$query" ] || return 0
  gh issue list --repo "$REPO" --state all --limit 5 \
    --search "${query} in:body" \
    --json number,state,closedAt,labels,updatedAt \
    --jq '.[0] // empty'
}

# PostHog-created GitHub issues put the fingerprint in the body URL, not
# always the issue UUID. Try UUID first, then fingerprint.
find_github_issue() {
  local issue_id=$1
  local fingerprint=$2
  local found
  found=$(search_github_issue "$issue_id")
  if [ -n "$found" ]; then
    printf '%s' "$found"
    return 0
  fi
  search_github_issue "$fingerprint"
}

last_bot_comment_at() {
  local number=$1
  gh api "repos/${REPO}/issues/${number}/comments?per_page=100" \
    --jq '[.[] | select(.user.login == "claude" or .user.login == "claude[bot]" or .user.login == "github-actions[bot]")] | max_by(.created_at) | .created_at // empty' \
    2>/dev/null
}

label_names() {
  printf '%s' "$1" | jq -r '.labels[].name // empty'
}

issue_has_label() {
  printf '%s\n' "$1" | grep -qx "$2"
}

dispatch() {
  local number=$1
  if [ "$DRY_RUN" = "1" ]; then
    log "dispatch ${number}"
    return 0
  fi
  gh workflow run "$WORKFLOW_FILE" --repo "$REPO" \
    --field "issue_number=${number}"
}

create_issue() {
  local issue_id=$1
  local fingerprint=$2
  local message=$3
  local title body url created
  title=$(title_from_message "$message")
  if [ -z "$title" ]; then
    title="Error"
  fi
  if [ -n "$fingerprint" ] && [ "$fingerprint" != "null" ]; then
    url="${POSTHOG_HOST}/project/${POSTHOG_PROJECT_ID}/error_tracking/fingerprint/${fingerprint}"
  else
    url="${POSTHOG_HOST}/project/${POSTHOG_PROJECT_ID}/error_tracking/${issue_id}"
  fi
  body=$(printf '%s\n\n[View in PostHog](%s)\n\nPostHog issue: %s\n' \
    "$message" "$url" "$issue_id")
  if [ "$DRY_RUN" = "1" ]; then
    printf '0\n'
    return 0
  fi
  created=$(gh issue create --repo "$REPO" --title "$title" --body "$body")
  printf '%s\n' "${created##*/}"
}

needs_dispatch() {
  local last_seen=$1
  local gh_issue=$2
  local labels last_seen_epoch closed_epoch comment_at comment_epoch updated_at updated_epoch

  if [ -z "$gh_issue" ]; then
    printf 'create\n'
    return 0
  fi

  labels=$(label_names "$gh_issue")
  last_seen_epoch=$(iso_to_epoch "$last_seen")

  local state
  state=$(printf '%s' "$gh_issue" | jq -r '.state')
  if [ "$state" = "CLOSED" ] || [ "$state" = "closed" ]; then
    local closed_at
    closed_at=$(printf '%s' "$gh_issue" | jq -r '.closedAt // empty')
    if [ -z "$closed_at" ]; then
      printf 'skip-closed-no-timestamp\n'
      return 1
    fi
    closed_epoch=$(iso_to_epoch "$closed_at")
    if [ "$last_seen_epoch" -gt "$closed_epoch" ]; then
      printf 'recurrence\n'
      return 0
    fi
    printf 'skip-still-quiet\n'
    return 1
  fi

  if issue_has_label "$labels" 'autofix:failed'; then
    printf 'failed\n'
    return 0
  fi

  if issue_has_label "$labels" 'autofix'; then
    local number
    number=$(printf '%s' "$gh_issue" | jq -r '.number')
    comment_at=$(last_bot_comment_at "$number")
    if [ -n "$comment_at" ]; then
      comment_epoch=$(iso_to_epoch "$comment_at")
      if [ "$last_seen_epoch" -le "$comment_epoch" ]; then
        printf 'skip-handled\n'
        return 1
      fi
      printf 'recurrence-open\n'
      return 0
    fi
    updated_at=$(printf '%s' "$gh_issue" | jq -r '.updatedAt // empty')
    if [ -n "$updated_at" ]; then
      updated_epoch=$(iso_to_epoch "$updated_at")
      if [ $(($(now_epoch) - updated_epoch)) -lt $((IN_FLIGHT_MINUTES * 60)) ]; then
        printf 'skip-in-flight\n'
        return 1
      fi
    fi
    printf 'stuck-no-comment\n'
    return 0
  fi

  printf 'unlabeled\n'
  return 0
}

main() {
  local dispatched=0
  local row issue_id fingerprint message last_seen gh_issue reason number
  local rows
  rows=$(mktemp)
  if ! fetch_exceptions >"$rows"; then
    notify "Error autofix sweep could not query PostHog"
    rm -f "$rows"
    return 1
  fi

  while IFS= read -r row; do
    [ -n "$row" ] || continue
    if [ "$dispatched" -ge "$MAX_DISPATCHES" ]; then
      log "cap reached (${MAX_DISPATCHES}); remaining wait for the next sweep"
      break
    fi
    issue_id=$(printf '%s' "$row" | jq -r '.issue_id')
    fingerprint=$(printf '%s' "$row" | jq -r '.fingerprint // empty')
    message=$(printf '%s' "$row" | jq -r '.message // "Error"')
    last_seen=$(printf '%s' "$row" | jq -r '.last_seen')
    gh_issue=$(find_github_issue "$issue_id" "$fingerprint")
    if ! reason=$(needs_dispatch "$last_seen" "$gh_issue"); then
      log "skip ${issue_id} (${reason})"
      continue
    fi
    if [ -z "$gh_issue" ]; then
      number=$(create_issue "$issue_id" "$fingerprint" "$message")
    else
      number=$(printf '%s' "$gh_issue" | jq -r '.number')
    fi
    if [ -z "$number" ] || [ "$number" = "null" ]; then
      log "skip ${issue_id} (no GitHub issue number)"
      continue
    fi
    log "${reason} #${number} (${issue_id})"
    if dispatch "$number"; then
      dispatched=$((dispatched + 1))
    else
      notify "Error autofix sweep could not dispatch #${number} for PostHog ${issue_id}"
    fi
  done <"$rows"
  rm -f "$rows"

  if [ "$dispatched" -gt 0 ]; then
    notify "Error autofix sweep dispatched ${dispatched} issue(s) for a fresh run"
  fi
}

main
