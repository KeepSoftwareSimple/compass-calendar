#!/usr/bin/env bash
# Hourly watchdog: autofix-merge-guard.sh only runs once, right after the
# workflow run that opened the PR, so a PR it missed (agent pushed late, a gh
# blip, a failed `gh pr merge --auto`) could sit open forever. PR #3655 and
# PR #5323 both did. This script re-lists open `autofix` PRs past a grace
# period every hour.
#
# merge mode: any such PR without auto-merge goes back through the merge
# guard. Nothing waits on a human, including PRs an older version of this
# pipeline parked with `autofix:needs-human`.
# pr mode: a human merges by design, so a stale PR is flagged once with
# `autofix:needs-human`.
set -uo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/autofix-lib.sh"

# Anchors to the autofix job's 45-minute timeout plus gate-and-merge's
# 15-minute timeout (chained via `needs: autofix` in error-autofix.yml), so
# this watchdog never races the same-run merge-guard over a PR that is still
# legitimately in flight.
GRACE_MINUTES=${AUTOFIX_WATCHDOG_GRACE_MINUTES:-60}
DRY_RUN=${AUTOFIX_WATCHDOG_DRY_RUN:-}
AUTOFIX_MODE=${AUTOFIX_MODE:-}

# Open autofix PRs still needing action. Every field the filter reads has to
# be in `--json`: gh returns only the fields asked for, so a missing
# `labels` once made the filter pass every PR and re-notify hourly.
list_unterminated_prs() {
  if [ "$AUTOFIX_MODE" = "merge" ]; then
    gh pr list --repo "$REPO" --label autofix --state open \
      --json number,createdAt,url,body,autoMergeRequest \
      --jq '[.[] | select(.autoMergeRequest == null)] | .[] | tojson'
  else
    gh pr list --repo "$REPO" --label autofix --state open \
      --json number,createdAt,url,labels \
      --jq '[.[] | select(
        [.labels[]?.name] | index("autofix:needs-human") | not
      )] | .[] | tojson'
  fi
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

# merge mode: hand the PR back to the merge guard, keyed by its issue.
remerge() {
  local pr_number=$1
  local body=$2
  local issue
  issue=$(printf '%s' "$body" | grep -oiE 'fixes #[0-9]+' | head -n1 | grep -oE '[0-9]+' || true)
  if [ -z "$issue" ]; then
    notify "Autofix PR #${pr_number} has no 'Fixes #N' line, so the merge guard cannot find it; closing"
    [ -n "$DRY_RUN" ] && return 0
    gh pr close "$pr_number" --repo "$REPO" \
      --comment "Closed by autofix-pr-watchdog: no 'Fixes #N' line." || return 1
    return 0
  fi
  printf 're-running merge guard for PR #%s (issue #%s)\n' "$pr_number" "$issue"
  [ -n "$DRY_RUN" ] && return 0
  "$AUTOFIX_SCRIPT_DIR/autofix-merge-guard.sh" "$issue"
}

# pr mode: flag a stale PR once for the human who merges in that mode.
escalate() {
  local pr_number=$1
  local created_at=$2
  local pr_url=$3
  local age msg edit_error

  age=$(age_human "$created_at")
  msg="Autofix PR #${pr_number} has been open ${age} (mode: ${AUTOFIX_MODE:-unknown}), waiting for manual merge; flagging since it's stale: ${pr_url}"

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
  local prs pr_json number created url failures=0 handled=0

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
      if [ "$AUTOFIX_MODE" = "merge" ]; then
        if remerge "$number" "$(jq -r '.body // ""' <<<"$pr_json")"; then
          handled=$((handled + 1))
        else
          failures=$((failures + 1))
        fi
      elif escalate "$number" "$created" "$url"; then
        handled=$((handled + 1))
      else
        failures=$((failures + 1))
      fi
    fi
  done <<<"$prs"

  printf 'checked open autofix PRs; handled %s (failed %s)\n' "$handled" "$failures"
  [ "$failures" -eq 0 ]
}

main
