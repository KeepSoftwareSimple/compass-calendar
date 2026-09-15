#!/usr/bin/env bash
# Deterministic re-check for an agent-loop PR, then GitHub auto-merge.
# The agent's `agent-automerge` label is necessary but not sufficient:
# this script independently re-verifies size rails, and refuses while main
# itself is red so the loop cannot stack merges on a broken base. Path
# prefixes are not a merge gate: agents may auto-merge any tree path.
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

MAX_FILES=${AGENT_LOOP_MAX_FILES:-60}
MAX_LINES=${AGENT_LOOP_MAX_LINES:-4000}
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

downgrade() {
  local pr_number=$1
  local reason=$2
  if [ -n "$DRY_RUN" ]; then
    printf 'downgrade: %s\n' "$reason"
    return 0
  fi
  notify "Agent-loop PR #${pr_number} ${reason}; leaving for human review: https://github.com/${REPO}/pull/${pr_number}"
  gh pr merge "$pr_number" --repo "$REPO" --disable-auto 2>/dev/null || true
  gh pr edit "$pr_number" --repo "$REPO" --remove-label "$AUTOMERGE_LABEL" 2>/dev/null || true
  gh pr edit "$pr_number" --repo "$REPO" --add-label "$NEEDS_HUMAN_LABEL" 2>/dev/null || true
  local issue_number
  issue_number=$(issue_number_for_pr "$pr_number")
  if [ -n "$issue_number" ]; then
    gh issue comment "$issue_number" --repo "$REPO" \
      --body "${COMMENT_PREFIX} merge-guard refused #${pr_number}: ${reason}. Added \`${NEEDS_HUMAN_LABEL}\`." \
      2>/dev/null || true
    gh issue edit "$issue_number" --repo "$REPO" \
      --add-label "$NEEDS_HUMAN_LABEL" --remove-label "$RUNNING_LABEL" \
      2>/dev/null || true
  fi
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

# The latest push run of each required workflow on main. A red main means the
# base is broken; merging more on top hides which change broke it. Fails
# closed: an unreadable result counts as red.
#
# release-on-main.yml is here because test-unit.yml and test-e2e.yml both
# passing does not mean main can ship: #3814-#3816 built and merged fine but
# release-on-main's Docker image build failed on every push for most of a
# day (a stale boot-size ceiling), leaving staging and prod stuck on old web
# images with nobody notified. perf-budget.yml is deliberately not included;
# the boot-size budget it also exercises is now a required PR check (see
# test-unit.yml's `static` job), so a PR that would break it never reaches
# main in the first place.
main_is_red() {
  local workflow conclusion
  for workflow in test-unit.yml test-e2e.yml release-on-main.yml; do
    conclusion=$(gh run list --repo "$REPO" --workflow "$workflow" --branch main \
      --event push --status completed --limit 1 --json conclusion \
      --jq '.[0].conclusion // "unknown"' 2>/dev/null || echo "unknown")
    case "$conclusion" in
      success|skipped|cancelled) ;;
      *)
        printf 'main %s latest push run: %s\n' "$workflow" "$conclusion"
        return 0
        ;;
    esac
  done
  return 1
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

# After path/size/red-main pass: rebase onto main when the PR is dirty, then
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

  local changed_files_list changed_files total_lines
  if [ -n "${AGENT_LOOP_GUARD_FILES:-}" ]; then
    changed_files_list=$AGENT_LOOP_GUARD_FILES
  elif ! changed_files_list=$(gh pr diff "$pr_number" --repo "$REPO" --name-only); then
    downgrade "$pr_number" "could not verify changed files (gh pr diff failed), treating as unsafe"
    return 0
  fi
  changed_files=$(printf '%s\n' "$changed_files_list" | grep -c . || true)

  if [ "$changed_files" -gt "$MAX_FILES" ]; then
    downgrade "$pr_number" "touches ${changed_files} files (limit ${MAX_FILES})"
    return 0
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

  if ! total_lines=$(gh pr view "$pr_number" --repo "$REPO" --json additions,deletions \
    --jq '.additions + .deletions') || [ -z "$total_lines" ]; then
    downgrade "$pr_number" "could not verify line count (gh pr view failed), treating as unsafe"
    return 0
  fi
  if [ "$total_lines" -gt "$MAX_LINES" ]; then
    downgrade "$pr_number" "changes ${total_lines} lines (limit ${MAX_LINES})"
    return 0
  fi

  if main_is_red; then
    printf 'main is red; not enabling auto-merge on PR #%s. The scheduled sweep retries.\n' "$pr_number"
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
