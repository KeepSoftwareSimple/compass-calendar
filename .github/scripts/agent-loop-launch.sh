#!/usr/bin/env bash
# Launch one or more agent-loop agents for GitHub issues via the Cursor
# Cloud Agents API only. CURSOR_API_KEY is required; there is no pickup
# comment fallback (that was a second agent channel).
set -euo pipefail

ISSUE_NUMBER=${1:?usage: agent-loop-launch.sh <issue-number> [issue-number...]}

if [ "$#" -gt 1 ]; then
  for n in "$@"; do
    "$0" "$n"
  done
  exit 0
fi

# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/agent-loop-lib.sh"

if [ -z "$REPO" ]; then
  echo "GITHUB_REPOSITORY or GH_REPO is required" >&2
  exit 1
fi

if [ -z "${CURSOR_API_KEY:-}" ]; then
  gh issue edit "$ISSUE_NUMBER" --repo "$REPO" \
    --add-label "$NEEDS_HUMAN_LABEL" --remove-label "$RUNNING_LABEL" \
    2>/dev/null || \
    gh issue edit "$ISSUE_NUMBER" --repo "$REPO" --add-label "$NEEDS_HUMAN_LABEL"
  notify "${COMMENT_PREFIX} CURSOR_API_KEY is unset; cannot launch #${ISSUE_NUMBER}"
  echo "CURSOR_API_KEY is required to launch. Added ${NEEDS_HUMAN_LABEL} on #${ISSUE_NUMBER}." >&2
  set_output launch_mode missing-key
  exit 1
fi

issue_url="https://github.com/${REPO}/issues/${ISSUE_NUMBER}"
milestone_title=$(gh issue view "$ISSUE_NUMBER" --repo "$REPO" --json milestone --jq '.milestone.title // empty' 2>/dev/null || true)
prompt_file=$(prompt_path_for_milestone "$milestone_title")
prompt_rel=".github/prompts/$(basename "$prompt_file")"

gh issue edit "$ISSUE_NUMBER" --repo "$REPO" --add-label "$RUNNING_LABEL" \
  --remove-label "$NEEDS_HUMAN_LABEL" 2>/dev/null || \
  gh issue edit "$ISSUE_NUMBER" --repo "$REPO" --add-label "$RUNNING_LABEL"
gh issue edit "$ISSUE_NUMBER" --repo "$REPO" \
  --remove-label "$QUOTA_WAITING_LABEL" 2>/dev/null || true

prompt_text=$(cat <<EOF
You are running the Compass Calendar agent-loop Routine.
Kill switch AGENT_LOOP_ENABLED is true (this launch would not have happened otherwise).
Target issue: #${ISSUE_NUMBER}
Issue URL: ${issue_url}
Milestone: ${milestone_title}

Read ${prompt_rel} and follow it exactly.
Follow the shared shipping and production promotion policy in AGENTS.md.
Read the Spec: link from the issue body (do not re-litigate locked decisions).

Take only the work package for this issue from origin/main. Other in-flight issues on different partitions are expected.
EOF
)

payload=$(
  jq -n \
    --arg text "$prompt_text" \
    --arg repo "$(github_repo_url)" \
    "{
      prompt: {text: \$text},
      source: {repository: \$repo, ref: \"main\"},
      target: {autoCreatePr: false}
    }"
)

tmp=$(mktemp)
headers=$(mktemp)
http_code=$(
  curl -sS -D "$headers" -o "$tmp" -w "%{http_code}" \
    --request POST \
    --url https://api.cursor.com/v0/agents \
    -u "${CURSOR_API_KEY}:" \
    --header "Content-Type: application/json" \
    --data "$payload"
) || http_code="000"

if [ "$http_code" = "429" ]; then
  retry_after_seconds=$(awk 'BEGIN { IGNORECASE = 1 } /^retry-after:/ {
    gsub("\\r", "", $2)
    if ($2 ~ /^[0-9]+$/) print $2
    exit
  }' "$headers")
  retry_after_seconds=${retry_after_seconds:-3600}
  if [ "$retry_after_seconds" -lt 3600 ]; then
    retry_after_seconds=3600
  fi
  if [ "$retry_after_seconds" -gt 86400 ]; then
    retry_after_seconds=86400
  fi
  next_retry_at=$(python3 - "$retry_after_seconds" <<'PY'
from datetime import datetime, timedelta, timezone
import sys

print((datetime.now(timezone.utc) + timedelta(seconds=int(sys.argv[1]))).isoformat().replace("+00:00", "Z"))
PY
)
  rm -f "$tmp" "$headers"
  gh issue comment "$ISSUE_NUMBER" --repo "$REPO" --body "$(cat <<BODY
${COMMENT_PREFIX} Cursor quota exhausted (HTTP 429). Waiting until ${next_retry_at}, then the watchdog will retry this WP.

<!-- ${QUOTA_RETRY_MARKER}${next_retry_at} -->
BODY
)"
  gh issue edit "$ISSUE_NUMBER" --repo "$REPO" \
    --add-label "$QUOTA_WAITING_LABEL" --remove-label "$RUNNING_LABEL" \
    2>/dev/null || \
    gh issue edit "$ISSUE_NUMBER" --repo "$REPO" --add-label "$QUOTA_WAITING_LABEL"
  gh issue edit "$ISSUE_NUMBER" --repo "$REPO" \
    --remove-label "$NEEDS_HUMAN_LABEL" 2>/dev/null || true
  notify "${COMMENT_PREFIX} Cursor quota exhausted for #${ISSUE_NUMBER}; retrying after ${next_retry_at}"
  echo "Cursor quota exhausted for #${ISSUE_NUMBER}; retry after ${next_retry_at}."
  set_output launch_mode quota-wait
  set_output retry_after_seconds "$retry_after_seconds"
  exit 0
fi

if [ "$http_code" -lt 200 ] || [ "$http_code" -ge 300 ]; then
  body=$(head -c 800 "$tmp" || true)
  rm -f "$tmp" "$headers"
  follow_up="The hourly watchdog can retry. Investigate the launch failure if it recurs."
  if [ "$http_code" = "401" ] || [ "$http_code" = "403" ]; then
    follow_up="The Cursor integration owner needs to restore Cloud Agents access, then re-dispatch Agent loop."
    gh issue edit "$ISSUE_NUMBER" --repo "$REPO" --add-label "$NEEDS_HUMAN_LABEL"
  fi
  gh issue comment "$ISSUE_NUMBER" --repo "$REPO" --body "$(cat <<BODY
${COMMENT_PREFIX} Cursor API launch failed (HTTP ${http_code}).

\`\`\`
${body}
\`\`\`

${follow_up}
BODY
)"
  gh issue edit "$ISSUE_NUMBER" --repo "$REPO" --remove-label "$RUNNING_LABEL" 2>/dev/null || true
  notify "${COMMENT_PREFIX} Cursor API launch failed for #${ISSUE_NUMBER} (HTTP ${http_code})"
  echo "Cursor API launch failed HTTP ${http_code}" >&2
  exit 1
fi

agent_url=$(jq -r '.target.url // .id // empty' "$tmp")
agent_id=$(jq -r '.id // empty' "$tmp")
rm -f "$tmp" "$headers"

gh issue comment "$ISSUE_NUMBER" --repo "$REPO" --body "$(cat <<BODY
${COMMENT_PREFIX} launched Cursor cloud agent \`${agent_id}\`.
${agent_url}
BODY
)"
echo "Launched Cursor agent ${agent_id} for #${ISSUE_NUMBER}"
set_output launch_mode api
set_output agent_id "$agent_id"
