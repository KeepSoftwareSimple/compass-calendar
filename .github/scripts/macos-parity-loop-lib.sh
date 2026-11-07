#!/usr/bin/env bash
# Shared helpers for the scoped macOS parity maintenance loop.
# shellcheck disable=SC2034
REPO=${GH_REPO:-${GITHUB_REPOSITORY:-}}
MACOS_PARITY_LOOP_SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
RUNNING_LABEL="macos-parity-loop-running"
QUOTA_WAITING_LABEL="macos-parity-loop-waiting-for-credits"
NEEDS_HUMAN_LABEL="macos-parity-loop-needs-human"
COMMENT_PREFIX="macos-parity-loop:"
QUOTA_RETRY_MARKER="macos-parity-quota-retry-at="
PARENT_ISSUE=${MACOS_PARITY_LOOP_PARENT_ISSUE:-4783}

set_output() {
  local key=$1
  local value=$2
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    printf '%s=%s\n' "$key" "$value" >>"$GITHUB_OUTPUT"
  fi
}

github_repo_url() {
  printf 'https://github.com/%s' "$REPO"
}

notify() {
  local message=$1
  if [ -x "${MACOS_PARITY_LOOP_SCRIPT_DIR}/discord-notify.sh" ]; then
    "${MACOS_PARITY_LOOP_SCRIPT_DIR}/discord-notify.sh" "$message" || true
  fi
}
