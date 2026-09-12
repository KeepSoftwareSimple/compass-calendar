#!/usr/bin/env bash
# Hourly watchdog: an autofix-authored PR can sit open forever with no
# distinguishing signal if the agent never applies `automerge-candidate`
# (see .github/prompts/error-autofix.md's confidence rubric, which tells the
# agent to err toward leaving the label off) — autofix-merge-guard.sh only
# runs once, reactively, right after the same workflow run that opened the
# PR, and finds nothing to merge in that case. This script re-lists all open
# `autofix`-labeled PRs on every hourly tick and escalates any that are past
# a grace period with neither `automerge-candidate` nor `autofix:needs-human`
# already applied. Motivated by PR #3655 (issue #2901), which sat unmerged
# and unlabeled with nothing surfacing that fact anywhere.
set -uo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/autofix-lib.sh"

# Anchors to the autofix job's 45-minute timeout plus gate-and-merge's
# 15-minute timeout (chained via `needs: autofix` in error-autofix.yml), so
# this watchdog never races the same-run merge-guard over a PR that is still
# legitimately in flight.
GRACE_MINUTES=${AUTOFIX_WATCHDOG_GRACE_MINUTES:-60}
DRY_RUN=${AUTOFIX_WATCHDOG_DRY_RUN:-}
AUTOFIX_MODE=${AUTOFIX_MODE:-}

# Open autofix PRs that carry neither terminal label, so escalation is the
# only thing left for them. `labels` has to be in `--json`: gh returns only
# the fields asked for, so leaving it out made the filter read an absent
# `.labels`, pass every PR, and re-notify already-escalated ones hourly.
list_unterminated_prs() {
  gh pr list --repo "$REPO" --label autofix --state open \
    --json number,createdAt,url,labels \
    --jq '[.[] | select(
      ([.labels[]?.name] | index("automerge-candidate") | not) and
      ([.labels[]?.name] | index("autofix:needs-human") | not)
    )] | .[] | tojson'
}

is_stale() {
  local created_at=$1
  local created_epoch
  created_epoch=$(iso_to_epoch "$created_at")
  [ $(($(now_epoch) - created_epoch)) -ge $((GRACE_MINUTES * 60)) ]
}

age_human() {
  local created_at=$1
  local minutes=$(( ($(now_epoch) - $(iso_to_epoch "$created_at")) / 60 ))
  printf '%dh %dm' "$((minutes / 60))" "$((minutes % 60))"
}

escalate() {
  local pr_number=$1
  local created_at=$2
  local pr_url=$3
  local age tail msg edit_error

  age=$(age_human "$created_at")
  if [ "$AUTOFIX_MODE" = "merge" ]; then
    tail="needs a merge decision"
  else
    tail="waiting for manual merge; flagging since it's stale"
  fi
  msg="Autofix PR #${pr_number} has been open ${age} with no automerge-candidate or autofix:needs-human label (mode: ${AUTOFIX_MODE:-unknown}) — ${tail}: ${pr_url}"

  if [ -n "$DRY_RUN" ]; then
    printf '%s\n' "$msg"
    return 0
  fi

  ensure_label "autofix:needs-human" B60205 "Autofix run needs manual review"
  if ! edit_error=$(gh pr edit "$pr_number" --repo "$REPO" --add-label "autofix:needs-human" 2>&1); then
    msg="${msg} (failed to apply autofix:needs-human label: ${edit_error} — will retry next hour)"
    printf '%s\n' "$msg"
    notify "$msg"
    return 1
  fi

  printf '%s\n' "$msg"
  notify "$msg"
}

main() {
  local prs pr_json number created url failures=0 escalated=0

  if ! prs=$(list_unterminated_prs); then
    notify "Error autofix PR watchdog could not list open autofix PRs (gh pr list failed)"
    return 1
  fi

  while IFS= read -r pr_json; do
    [ -n "$pr_json" ] || continue
    number=$(jq -r '.number' <<<"$pr_json")
    created=$(jq -r '.createdAt' <<<"$pr_json")
    url=$(jq -r '.url' <<<"$pr_json")
    if is_stale "$created"; then
      if escalate "$number" "$created" "$url"; then
        escalated=$((escalated + 1))
      else
        failures=$((failures + 1))
      fi
    fi
  done <<<"$prs"

  printf 'checked open autofix PRs; escalated %s (failed %s)\n' "$escalated" "$failures"
  [ "$failures" -eq 0 ]
}

main
