#!/usr/bin/env bash
# Deterministic gate that runs before the error-autofix LLM agent. These
# checks are cheap on purpose: a runaway loop (e.g. a merged fix that itself
# causes new PostHog issues) should be caught here, before it burns agent
# turns, and should page a human via Discord rather than spin silently.
set -uo pipefail

ISSUE_NUMBER=${1:?usage: autofix-preflight.sh <issue-number>}
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/autofix-lib.sh"

proceed() {
  printf 'proceed=%s\n' "$1" >>"$GITHUB_OUTPUT"
}

# Runs only under runs-on: ubuntu-latest (see error-autofix.yml), where GNU
# date's "N hours ago" form is always available — no BSD fallback needed.
since_hours_ago() {
  date -u -d "${1} hours ago" +%Y-%m-%dT%H:%M:%SZ
}

issue_labels() {
  gh issue view "$ISSUE_NUMBER" --repo "$REPO" --json labels \
    --jq '.labels[].name'
}

has_label() {
  printf '%s\n' "$1" | grep -qx "$2"
}

issue_state() {
  gh issue view "$ISSUE_NUMBER" --repo "$REPO" --json state \
    --jq '.state'
}

# A prior run that died before commenting or opening a PR leaves
# autofix:failed (see autofix-unstick.sh). A GitHub reopen, the one-shot
# automatic retry dispatch, or a closed issue the sweep is feeding back
# in must not look "already handled" just because autofix is still on it.
should_retry() {
  local labels=$1
  local state=$2
  if has_label "$labels" 'autofix:failed'; then
    return 0
  fi
  if [ "${GITHUB_EVENT_NAME:-}" = "issues" ] &&
    [ "${GITHUB_EVENT_ACTION:-}" = "reopened" ]; then
    return 0
  fi
  if [ "${AUTOFIX_RETRY_ATTEMPT:-0}" = "1" ]; then
    return 0
  fi
  if [ "$state" = "CLOSED" ]; then
    return 0
  fi
  return 1
}

# More than 3 posthog[bot] issues in 6h suggests a systemic incident (an
# outage, a bad deploy) rather than N independent bugs — a human should
# triage the incident, not N parallel agent runs. The hourly sweep
# retries these later because this path does not add the autofix label.
too_many_recent_issues() {
  local since count
  since=$(since_hours_ago 6)
  count=$(gh api "repos/${REPO}/issues?state=all&creator=posthog%5Bbot%5D&since=${since}" \
    --jq 'length' 2>/dev/null)
  [ "${count:-0}" -gt 3 ]
}

# 2+ autofix merges in 2h is the feedback-loop signature: a fix landing,
# triggering a new error, triggering another "fix". Pause and let a human
# look rather than let it compound.
too_many_recent_merges() {
  local since count
  since=$(since_hours_ago 2)
  count=$(gh pr list --repo "$REPO" --label autofix --state merged \
    --search "merged:>=${since}" --json number --jq 'length' 2>/dev/null)
  [ "${count:-0}" -ge 2 ]
}

reopen_if_closed() {
  local state=$1
  if [ "$state" = "CLOSED" ]; then
    gh issue reopen "$ISSUE_NUMBER" --repo "$REPO" >/dev/null
    printf 'reopened closed issue #%s so autofix can comment\n' "$ISSUE_NUMBER"
  fi
}

main() {
  local labels state
  labels=$(issue_labels)
  state=$(issue_state)

  if has_label "$labels" 'autofix' && ! should_retry "$labels" "$state"; then
    printf 'issue #%s already has the autofix label; skipping\n' "$ISSUE_NUMBER"
    proceed false
    return 0
  fi

  if too_many_recent_issues; then
    notify "Error autofix paused: more than 3 PostHog issues opened in the last 6h. Issue #${ISSUE_NUMBER} needs a human look — https://github.com/${REPO}/issues/${ISSUE_NUMBER}"
    proceed false
    return 0
  fi

  if too_many_recent_merges; then
    notify "Error autofix paused: 2+ autofix PRs merged in the last 2h (possible feedback loop). Issue #${ISSUE_NUMBER} needs a human look — https://github.com/${REPO}/issues/${ISSUE_NUMBER}"
    proceed false
    return 0
  fi

  reopen_if_closed "$state"
  ensure_label autofix 5319E7 "Opened/handled by the error-autofix pipeline"
  if has_label "$labels" 'autofix:failed'; then
    gh issue edit "$ISSUE_NUMBER" --repo "$REPO" --remove-label autofix:failed
  fi
  gh issue edit "$ISSUE_NUMBER" --repo "$REPO" --add-label autofix
  proceed true
}

main
