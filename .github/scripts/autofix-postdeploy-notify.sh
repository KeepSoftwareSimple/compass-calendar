#!/usr/bin/env bash
# Runs after "Release on main" completes. If the released commit was an
# autofix merge, comment on the source issue and ping Discord with a
# ready-to-run production deploy command. Production stays a deliberate
# manual step — this script never dispatches the deploy itself.
set -uo pipefail

HEAD_SHA=${HEAD_SHA:?missing HEAD_SHA}
CONCLUSION=${CONCLUSION:-success}
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/autofix-lib.sh"

main() {
  local tag
  tag=$(git tag --points-at "$HEAD_SHA" | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -n1)
  if [ -z "$tag" ]; then
    printf 'no release tag points at %s; nothing to verify\n' "$HEAD_SHA"
    return 0
  fi

  local pr_number
  pr_number=$(gh api "repos/${REPO}/commits/${HEAD_SHA}/pulls" --jq '.[0].number' 2>/dev/null)
  if [ -z "$pr_number" ] || [ "$pr_number" = "null" ]; then
    return 0
  fi

  local pr_labels
  pr_labels=$(gh pr view "$pr_number" --repo "$REPO" --json labels --jq '.labels[].name' 2>/dev/null)
  if ! printf '%s\n' "$pr_labels" | grep -qx 'autofix'; then
    return 0
  fi

  if [ "$CONCLUSION" != "success" ]; then
    notify "Autofix release ${tag} (PR #${pr_number}) FAILED the staging deploy/health check. Investigate before any production deploy — https://github.com/${REPO}/pull/${pr_number}"
    return 0
  fi

  local issue_number
  issue_number=$(gh pr view "$pr_number" --repo "$REPO" --json body --jq '.body' 2>/dev/null |
    grep -oE 'Fixes #[0-9]+' | grep -oE '[0-9]+' | head -n1)

  local prod_cmd="gh workflow run deploy-production.yml -f tag=${tag}"

  if [ -n "$issue_number" ]; then
    gh issue comment "$issue_number" --repo "$REPO" \
      --body "${tag} is live on staging via #${pr_number}. Production deploy: \`${prod_cmd}\`" \
      2>/dev/null || true
    resolve_linked_posthog_issue "$issue_number" || true
  fi

  notify "Autofix release ${tag} verified on staging (PR #${pr_number}). Production deploy ready: \`${prod_cmd}\`"
}

main
