#!/usr/bin/env bash
# Deterministic re-check for an agent-loop PR, then GitHub auto-merge.
# The agent's `agent-automerge` label requests queueing by the workflow.
# GitHub's merge queue enforces the required checks.
#
# It does not wait on CI. `gh pr merge --auto` hands the wait to GitHub,
# which squash-merges when the required checks pass; a runner that sat
# watching checks for up to 20 minutes was what starved the loop's
# concurrency group on 2026-09-03.
#
# Uses GH_TOKEN from AGENT_LOOP_GITHUB_TOKEN or AUTOFIX_GITHUB_TOKEN so
# the merge push triggers release-on-main (GITHUB_TOKEN merges do not).
set -uo pipefail

# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/agent-loop-lib.sh"

PR_NUMBER=${1:-}

DRY_RUN=${AGENT_LOOP_GUARD_DRY_RUN:-}

if [ -z "$REPO" ]; then
  echo "GITHUB_REPOSITORY or GH_REPO is required" >&2
  exit 1
fi

if [ -z "$DRY_RUN" ] && [ -z "${GH_TOKEN:-}" ]; then
  echo "GH_TOKEN is empty. Set AGENT_LOOP_GITHUB_TOKEN or AUTOFIX_GITHUB_TOKEN so squash-merge triggers release-on-main." >&2
  exit 1
fi

issue_number_for_pr() {
  local pr_number=$1
  gh pr view "$pr_number" --repo "$REPO" --json body --jq '.body' 2>/dev/null |
    grep -oE '[Ff]ixes #[0-9]+' | grep -oE '[0-9]+' | head -n1
}

# Conflicted automerge PRs block the picker (open Fixes PR). Close the PR
# and drop running/automerge so the issue stays agent-ready for a relaunch.
# Do not add needs-human: this is expected loop recovery, not a human stop.
close_and_requeue() {
  local pr_number=$1
  local reason=$2
  if [ -n "$DRY_RUN" ]; then
    printf 'requeue: %s\n' "$reason"
    return 0
  fi
  local issue_number
  issue_number=$(issue_number_for_pr "$pr_number")
  gh pr merge "$pr_number" --repo "$REPO" --disable-auto 2>/dev/null || true
  gh pr comment "$pr_number" --repo "$REPO" \
    --body "${COMMENT_PREFIX} ${reason}. Closing so the issue can be relaunched." \
    2>/dev/null || true
  gh pr edit "$pr_number" --repo "$REPO" --remove-label "$AUTOMERGE_LABEL" 2>/dev/null || true
  gh pr close "$pr_number" --repo "$REPO" 2>/dev/null || true
  if [ -n "$issue_number" ]; then
    gh issue comment "$issue_number" --repo "$REPO" \
      --body "${COMMENT_PREFIX} closed conflicting PR #${pr_number}: ${reason}. Issue stays \`${READY_LABEL}\` for the next kick." \
      2>/dev/null || true
    gh issue edit "$issue_number" --repo "$REPO" \
      --remove-label "$RUNNING_LABEL" 2>/dev/null || true
  fi
  printf 'closed PR #%s and requeued the issue (%s)\n' "$pr_number" "$reason"
}

find_prs() {
  if [ -n "$PR_NUMBER" ]; then
    printf '%s\n' "$PR_NUMBER"
    return 0
  fi
  if [ -n "$DRY_RUN" ]; then
    return 0
  fi
  gh pr list --repo "$REPO" --label "$AUTOMERGE_LABEL" --state open \
    --json number --jq '.[].number'
}

pr_has_automerge() {
  local labels=$1
  printf '%s\n' "$labels" | grep -qx "$AUTOMERGE_LABEL"
}

pr_mergeable_state() {
  local pr_number=$1
  if [ -n "${AGENT_LOOP_GUARD_MERGEABLE:-}" ]; then
    printf '%s' "$AGENT_LOOP_GUARD_MERGEABLE"
    return 0
  fi
  gh pr view "$pr_number" --repo "$REPO" --json mergeable \
    --jq '.mergeable // empty' 2>/dev/null || true
}

is_conflict_error() {
  local err=$1
  printf '%s' "$err" | grep -qiE 'conflict|not mergeable|mergeable.*false|DIRTY'
}

try_update_branch() {
  local pr_number=$1
  if [ -n "$DRY_RUN" ]; then
    printf 'update-branch: %s\n' "$pr_number"
    return 0
  fi
  if gh pr update-branch "$pr_number" --repo "$REPO"; then
    return 0
  fi
  return 1
}

enable_auto_merge() {
  local pr_number=$1
  local merge_error
  if merge_error=$(gh pr merge "$pr_number" --repo "$REPO" --auto 2>&1); then
    printf 'enabled auto-merge on agent PR #%s; the merge queue squash-merges when required checks pass\n' "$pr_number"
    return 0
  fi
  printf '%s\n' "$merge_error" >&2
  printf '%s' "$merge_error"
  return 1
}

# Update the branch from main when the PR is dirty, then
# enable auto-merge. If it is still conflicting, close and requeue.
resolve_conflict_or_requeue() {
  local pr_number=$1
  local mergeable=$2
  local merge_error=${3:-}

  if [ "$mergeable" != "CONFLICTING" ] && ! is_conflict_error "$merge_error"; then
    return 1
  fi

  if try_update_branch "$pr_number"; then
    unset AGENT_LOOP_GUARD_MERGEABLE
    mergeable=$(pr_mergeable_state "$pr_number")
    if [ "$mergeable" != "CONFLICTING" ]; then
      if [ -n "$DRY_RUN" ]; then
        printf 'proceed\n'
        return 0
      fi
      if enable_auto_merge "$pr_number" >/dev/null; then
        printf 'enabled auto-merge on agent PR #%s after update-branch; the merge queue squash-merges when required checks pass\n' "$pr_number"
        return 0
      fi
    fi
  fi

  close_and_requeue "$pr_number" "still conflicting after update-branch onto main"
  return 0
}

check_and_merge() {
  local pr_number=$1

  if [ -z "$DRY_RUN" ]; then
    local labels
    labels=$(gh pr view "$pr_number" --repo "$REPO" --json labels --jq '.labels[].name' 2>/dev/null || true)
    if ! pr_has_automerge "$labels"; then
      printf 'PR #%s does not have %s; skipping\n' "$pr_number" "$AUTOMERGE_LABEL"
      return 0
    fi
  fi

  if [ -n "$DRY_RUN" ]; then
    if [ "${AGENT_LOOP_GUARD_MERGEABLE:-}" = "CONFLICTING" ]; then
      printf 'update-branch: %s\n' "$pr_number"
      if [ -n "${AGENT_LOOP_GUARD_STILL_DIRTY:-}" ]; then
        close_and_requeue "$pr_number" "still conflicting after update-branch onto main"
      else
        printf 'proceed\n'
      fi
      return 0
    fi
    printf 'proceed\n'
    return 0
  fi

  local mergeable
  mergeable=$(pr_mergeable_state "$pr_number")
  if [ "$mergeable" = "CONFLICTING" ]; then
    resolve_conflict_or_requeue "$pr_number" "$mergeable" ""
    return 0
  fi

  local auto_merge
  auto_merge=$(gh pr view "$pr_number" --repo "$REPO" --json autoMergeRequest \
    --jq '.autoMergeRequest.enabledAt // ""' 2>/dev/null || true)
  if [ -n "$auto_merge" ]; then
    printf 'auto-merge already enabled on PR #%s\n' "$pr_number"
    return 0
  fi

  # The ruleset merge queue owns the strategy (SQUASH) and the repo deletes
  # branches on merge; passing --squash or --delete-branch here is rejected
  # ("Cannot use --delete-branch when merge queue enabled", 2026-09-04).
  # Carry gh's own error into the notice so a token or queue problem is
  # readable from Discord instead of needing a job-log dig.
  local merge_error
  if merge_error=$(gh pr merge "$pr_number" --repo "$REPO" --auto 2>&1); then
    printf 'enabled auto-merge on agent PR #%s; the merge queue squash-merges when required checks pass\n' "$pr_number"
    return 0
  fi
  printf '%s\n' "$merge_error" >&2
  if is_conflict_error "$merge_error"; then
    resolve_conflict_or_requeue "$pr_number" "$mergeable" "$merge_error"
    return 0
  fi
  notify "Agent-loop PR #${pr_number} passed verification but \`gh pr merge --auto\` failed (${merge_error%%$'\n'*}): https://github.com/${REPO}/pull/${pr_number}"
  return 0
}

main() {
  local prs pr
  if [ -n "$DRY_RUN" ]; then
    check_and_merge "${PR_NUMBER:-0}"
    return 0
  fi
  prs=$(find_prs)
  if [ -z "$prs" ]; then
    printf 'no %s PR found\n' "$AUTOMERGE_LABEL"
    return 0
  fi
  while IFS= read -r pr; do
    [ -n "$pr" ] || continue
    check_and_merge "$pr"
  done <<<"$prs"
}

main
