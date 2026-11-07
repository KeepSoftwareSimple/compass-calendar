#!/usr/bin/env bash
# Pick the next scoped macOS parity maintenance task.
set -euo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/macos-parity-loop-lib.sh"

if [ -z "$REPO" ]; then
  echo "GITHUB_REPOSITORY or GH_REPO is required" >&2
  exit 1
fi

if gh issue view "$PARENT_ISSUE" --repo "$REPO" --json labels --jq '.labels[].name' 2>/dev/null \
  | grep -Fxq "$QUOTA_WAITING_LABEL"; then
  retry_at=$(gh issue view "$PARENT_ISSUE" --repo "$REPO" --json comments --jq '.comments[-1].body' 2>/dev/null \
    | sed -n "s/.*${QUOTA_RETRY_MARKER}\\([^ >]*\\).*/\\1/p" | tail -n 1)
  due=$(RETRY_AT="${retry_at:-}" python3 - <<'PY'
from datetime import datetime, timezone
import os

retry_at = os.environ.get("RETRY_AT", "")
if not retry_at:
    print("true")
else:
    try:
        ts = datetime.fromisoformat(retry_at.replace("Z", "+00:00"))
        print("true" if ts <= datetime.now(timezone.utc) else "false")
    except ValueError:
        print("true")
PY
)
  if [ "$due" != "true" ]; then
    echo "Waiting for Cursor quota retry on #${PARENT_ISSUE} until ${retry_at:-next watchdog}."
    set_output found false
    exit 0
  fi
fi

if gh issue view "$PARENT_ISSUE" --repo "$REPO" --json labels --jq '.labels[].name' 2>/dev/null \
  | grep -Fxq "$RUNNING_LABEL"; then
  updated=$(gh issue view "$PARENT_ISSUE" --repo "$REPO" --json updatedAt --jq '.updatedAt')
  stale=$(UPDATED="$updated" python3 - <<'PY'
from datetime import datetime, timedelta, timezone
import os

updated = datetime.fromisoformat(os.environ["UPDATED"].replace("Z", "+00:00"))
print("true" if updated <= datetime.now(timezone.utc) - timedelta(hours=3) else "false")
PY
)
  if [ "$stale" != "true" ]; then
    echo "Parent issue #${PARENT_ISSUE} still has ${RUNNING_LABEL}; treating as in-flight."
    set_output found false
    exit 0
  fi
  gh issue edit "$PARENT_ISSUE" --repo "$REPO" --remove-label "$RUNNING_LABEL" 2>/dev/null || true
  notify "${COMMENT_PREFIX} cleared stale ${RUNNING_LABEL} on #${PARENT_ISSUE}."
fi

pick_json=$(python3 -B docs/acceptance/macos-parity/parity_loop.py pick --state '{}')
has_task=$(python3 -c 'import json,sys; print("true" if json.loads(sys.stdin.read())["task"] else "false")' <<<"$pick_json")
if [ "$has_task" != "true" ]; then
  echo "No eligible macOS parity maintenance task."
  set_output found false
  exit 0
fi
stable_key=$(python3 -c 'import json,sys; print(json.loads(sys.stdin.read())["task"]["stableKey"])' <<<"$pick_json")
title=$(python3 -c 'import json,sys; print(json.loads(sys.stdin.read())["task"]["title"])' <<<"$pick_json")

echo "Selected task ${stable_key}: ${title}"
set_output found true
set_output stable_key "$stable_key"
set_output task_title "$title"
