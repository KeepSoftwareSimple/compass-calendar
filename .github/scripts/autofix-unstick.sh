#!/usr/bin/env bash
# Called when the autofix agent step fails. A failed run used to leave the
# autofix label on the issue, which made preflight treat it as handled, and
# there was no Discord page. Unstick so the hourly sweep or one automatic
# retry can take another pass.
set -uo pipefail

ISSUE_NUMBER=${1:?usage: autofix-unstick.sh <issue-number>}
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/autofix-lib.sh"

WORKFLOW_FILE=${AUTOFIX_WORKFLOW_FILE:-error-autofix.yml}
RUN_URL=${GITHUB_RUN_URL:-https://github.com/${REPO}/issues/${ISSUE_NUMBER}}

comment_and_label() {
  local extra=$1
  ensure_label autofix:failed B60205 \
    "Autofix agent run failed; eligible for retry"
  gh issue edit "$ISSUE_NUMBER" --repo "$REPO" \
    --remove-label autofix --add-label autofix:failed
  gh issue comment "$ISSUE_NUMBER" --repo "$REPO" \
    --body "Autofix agent failed before finishing triage. ${extra} Run: ${RUN_URL}"
}

dispatch_retry() {
  gh workflow run "$WORKFLOW_FILE" --repo "$REPO" \
    --field "issue_number=${ISSUE_NUMBER}" \
    --field "retry=true"
}

main() {
  if [ "${AUTOFIX_RETRY_ATTEMPT:-0}" = "1" ]; then
    ensure_label "autofix:needs-human" B60205 \
      "Autofix agent could not confidently auto-resolve or auto-fix this"
    gh issue edit "$ISSUE_NUMBER" --repo "$REPO" \
      --remove-label autofix --add-label autofix:failed \
      --add-label "autofix:needs-human"
    gh issue comment "$ISSUE_NUMBER" --repo "$REPO" \
      --body "Autofix agent failed on the automatic retry as well. Leaving autofix:needs-human. Run: ${RUN_URL}"
    notify "Error autofix failed twice on #${ISSUE_NUMBER}; needs a human look. ${RUN_URL}"
    return 0
  fi

  comment_and_label "Dispatching one automatic retry with a fresh workflow snapshot. That retry logs the full agent error."
  if dispatch_retry; then
    notify "Error autofix failed on #${ISSUE_NUMBER}; retrying once. ${RUN_URL}"
  else
    notify "Error autofix failed on #${ISSUE_NUMBER} and could not dispatch a retry. Needs a human look. ${RUN_URL}"
  fi
}

main
