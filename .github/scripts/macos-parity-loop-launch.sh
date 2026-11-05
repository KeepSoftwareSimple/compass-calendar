#!/usr/bin/env bash
# Launch one scoped macOS parity worker via the Cursor Cloud Agents API.
set -euo pipefail

STABLE_KEY=${1:?usage: macos-parity-loop-launch.sh <stable-key>}

# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/macos-parity-loop-lib.sh"

if [ -z "$REPO" ]; then
  echo "GITHUB_REPOSITORY or GH_REPO is required" >&2
  exit 1
fi

if [ -z "${CURSOR_API_KEY:-}" ]; then
  gh issue edit "$PARENT_ISSUE" --repo "$REPO" --add-label "$NEEDS_HUMAN_LABEL" 2>/dev/null || true
  notify "${COMMENT_PREFIX} CURSOR_API_KEY is unset; cannot launch ${STABLE_KEY}."
  echo "CURSOR_API_KEY is required." >&2
  exit 1
fi

gh issue edit "$PARENT_ISSUE" --repo "$REPO" --add-label "$RUNNING_LABEL" \
  --remove-label "$QUOTA_WAITING_LABEL" --remove-label "$NEEDS_HUMAN_LABEL" 2>/dev/null || true

prompt_text=$(cat <<EOF
You are running the scoped Compass macOS parity maintenance loop.
Kill switch MACOS_PARITY_LOOP_ENABLED must be true for this launch.
Parent tracking issue: #${PARENT_ISSUE}
Task stable key: ${STABLE_KEY}

Read .github/prompts/macos-parity-loop.md and follow it exactly.
Also read AGENTS.md, docs/development/macos-parity-flow.md, and docs/CI-CD/macos-parity-loop-routine.md.

Take only the bounded work package for stable key ${STABLE_KEY} from origin/main.
Implement the smallest meaningful native regression and fix, run bun run verify --strict,
open a draft PR, mark it ready after verify, then run gh pr merge --auto. Do not wait for CI.
Native UI XCTest runs only on GitHub-hosted Macs; dispatch remotely, never on a local desktop.
Never re-enable the general AGENT_LOOP or touch unrelated agent branches.
EOF
)

payload=$(
  jq -n \
    --arg text "$prompt_text" \
    --arg repo "$(github_repo_url)" \
    '{
      prompt: {text: $text},
      source: {repository: $repo, ref: "main"},
      target: {autoCreatePr: false}
    }'
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
  next_retry_at=$(python3 - "$retry_after_seconds" <<'PY'
from datetime import datetime, timedelta, timezone
import sys
print((datetime.now(timezone.utc) + timedelta(seconds=int(sys.argv[1]))).isoformat().replace("+00:00", "Z"))
PY
)
  rm -f "$tmp" "$headers"
  gh issue comment "$PARENT_ISSUE" --repo "$REPO" --body "$(cat <<BODY
${COMMENT_PREFIX} Cursor quota exhausted (HTTP 429). Waiting until ${next_retry_at}.

<!-- ${QUOTA_RETRY_MARKER}${next_retry_at} -->
BODY
)"
  gh issue edit "$PARENT_ISSUE" --repo "$REPO" \
    --add-label "$QUOTA_WAITING_LABEL" --remove-label "$RUNNING_LABEL" 2>/dev/null || true
  notify "${COMMENT_PREFIX} quota wait until ${next_retry_at} for ${STABLE_KEY}."
  set_output launch_mode quota-wait
  exit 0
fi

if [ "$http_code" -lt 200 ] || [ "$http_code" -ge 300 ]; then
  body=$(head -c 800 "$tmp" || true)
  rm -f "$tmp" "$headers"
  gh issue edit "$PARENT_ISSUE" --repo "$REPO" --add-label "$NEEDS_HUMAN_LABEL" 2>/dev/null || true
  echo "Cursor API launch failed HTTP ${http_code}: ${body}" >&2
  exit 1
fi

agent_id=$(jq -r '.id // empty' "$tmp")
agent_url=$(jq -r '.target.url // empty' "$tmp")
rm -f "$tmp" "$headers"

gh issue comment "$PARENT_ISSUE" --repo "$REPO" --body "$(cat <<BODY
${COMMENT_PREFIX} launched task \`${STABLE_KEY}\` as Cursor agent \`${agent_id}\`.
${agent_url}
BODY
)"
set_output launch_mode api
set_output agent_id "$agent_id"
