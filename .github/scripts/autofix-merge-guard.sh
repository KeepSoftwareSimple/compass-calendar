#!/usr/bin/env bash
# Deterministic re-check before enabling auto-merge on an agent-authored fix
# PR. In merge mode the agent opening a PR is its decision to ship (see
# .github/prompts/error-autofix.md); this script re-verifies the hard size
# rails so a mistaken or prompt-injected run can never merge past them, and
# required CI checks in the merge queue do the rest. Nothing here waits on a
# human: a PR over the rails is closed, not parked.
# Path prefixes are not a merge gate: size rails are the remaining check.
#
# Only runs when AUTOFIX_MODE=merge (see .github/workflows/error-autofix.yml).
# Inert (no PR to find) during Phase 1/2 rollout.
set -uo pipefail

ISSUE_NUMBER=${1:?usage: autofix-merge-guard.sh <issue-number>}
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/autofix-lib.sh"

MAX_FILES=8
MAX_LINES=250

# Too big for an unattended fix: close it so it never sits waiting on a human.
reject() {
  local pr_number=$1
  local reason=$2
  notify "Autofix PR #${pr_number} (issue #${ISSUE_NUMBER}) ${reason}; closed — https://github.com/${REPO}/pull/${pr_number}"
  gh pr close "$pr_number" --repo "$REPO" \
    --comment "Closed by autofix-merge-guard: ${reason}. Too large for an unattended fix." || true
}

# A gh failure is not a verdict on the PR: leave it open and unmerged, and
# the hourly watchdog runs this guard again.
retry_later() {
  local pr_number=$1
  local reason=$2
  notify "Autofix PR #${pr_number} (issue #${ISSUE_NUMBER}) ${reason}; the watchdog retries next hour — https://github.com/${REPO}/pull/${pr_number}"
  return 1
}

find_pr() {
  gh pr list --repo "$REPO" --label autofix --state open \
    --search "Fixes #${ISSUE_NUMBER} in:body" \
    --json number --jq '.[0].number' 2>/dev/null
}

main() {
  local pr_number
  pr_number=$(find_pr)

  if [ -z "$pr_number" ] || [ "$pr_number" = "null" ]; then
    printf 'no open autofix PR found for issue #%s\n' "$ISSUE_NUMBER"
    return 0
  fi

  # Every check below must fail CLOSED: if the `gh` call itself errors (rate
  # limit, transient network blip), an empty result must never be read as
  # "0 files changed" / "0 lines changed" and let the PR sail through — that
  # would silently defeat the one gate that's supposed to be non-bypassable.
  local changed_files_list changed_files total_lines
  if ! changed_files_list=$(gh pr diff "$pr_number" --repo "$REPO" --name-only); then
    retry_later "$pr_number" "could not verify changed files (gh pr diff failed)"
    return 1
  fi
  changed_files=$(printf '%s\n' "$changed_files_list" | grep -c . || true)

  if [ "$changed_files" -gt "$MAX_FILES" ]; then
    reject "$pr_number" "touches ${changed_files} files (limit ${MAX_FILES})"
    return 0
  fi

  if ! total_lines=$(gh pr view "$pr_number" --repo "$REPO" --json additions,deletions \
    --jq '.additions + .deletions') || [ -z "$total_lines" ]; then
    retry_later "$pr_number" "could not verify line count (gh pr view failed)"
    return 1
  fi
  if [ "$total_lines" -gt "$MAX_LINES" ]; then
    reject "$pr_number" "changes ${total_lines} lines (limit ${MAX_LINES})"
    return 0
  fi

  # Merge queue owns the strategy and the repo deletes branches on merge.
  # Carry gh's own error into the notice: without it the 2026-09-06 token
  # permission failure read as a generic "failed" and took a log dig to find.
  local merge_error
  if ! merge_error=$(gh pr merge "$pr_number" --repo "$REPO" --auto 2>&1); then
    printf '%s\n' "$merge_error" >&2
    retry_later "$pr_number" "passed the merge guard but \`gh pr merge --auto\` failed (${merge_error%%$'\n'*})"
    return 1
  fi
  # Do not watch CI here: this job runs under a cancel-in-progress:false
  # queue, so a runner sitting in `gh pr checks --watch` blocked the next
  # PostHog issue for up to 15 minutes. GitHub merges when checks pass.
  printf 'enabled auto-merge on PR #%s\n' "$pr_number"
}

main
