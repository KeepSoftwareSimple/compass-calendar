#!/usr/bin/env bash
# Run the live adapter contract / smoke suite for each provider whose
# provider-smoke Environment secrets are present. A provider listed in
# SMOKE_EXPECTED_PROVIDERS with missing secrets fails the job; other
# providers with missing secrets are skipped with a warning.
set -uo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT"

FAILED_PROVIDERS=()
SKIPPED_PROVIDERS=()
PASSED_PROVIDERS=()
EXPECTED_PROVIDERS=()

parse_expected_providers() {
  local raw=${SMOKE_EXPECTED_PROVIDERS:-}
  local -a parts
  local part
  EXPECTED_PROVIDERS=()
  [ -z "$raw" ] && return 0
  IFS=',' read -ra parts <<< "$raw"
  for part in "${parts[@]}"; do
    part="${part#"${part%%[![:space:]]*}"}"
    part="${part%"${part##*[![:space:]]}"}"
    [ -n "$part" ] && EXPECTED_PROVIDERS+=("$part")
  done
}

provider_expected() {
  local kind=$1
  local expected
  for expected in "${EXPECTED_PROVIDERS[@]+"${EXPECTED_PROVIDERS[@]}"}"; do
    if [ "$expected" = "$kind" ]; then
      return 0
    fi
  done
  return 1
}

run_kind() {
  local kind=$1
  echo "::group::LIVE_PROVIDER=${kind}"
  if LIVE_PROVIDER="$kind" bun test:sync -- \
    packages/sync/src/providers/__contract__/live-provider.smoke.test.ts \
    packages/sync/src/providers/__contract__/live-provider.contract.test.ts; then
    PASSED_PROVIDERS+=("$kind")
    echo "${kind}: pass"
  else
    FAILED_PROVIDERS+=("$kind")
    echo "${kind}: fail"
  fi
  echo "::endgroup::"
}

skip_kind() {
  local kind=$1
  local reason=$2
  SKIPPED_PROVIDERS+=("$kind")
  echo "::warning::${kind} skipped: ${reason}"
}

fail_kind() {
  local kind=$1
  local reason=$2
  FAILED_PROVIDERS+=("$kind")
  echo "::error::${kind} failed: ${reason}"
}

notify() {
  local message=$1
  if [ -x "$ROOT/.github/scripts/discord-notify.sh" ]; then
    bash "$ROOT/.github/scripts/discord-notify.sh" "$message"
  fi
}

google_ready() {
  [ -n "${SMOKE_GOOGLE_REFRESH_TOKEN:-}" ] &&
    { [ -n "${GOOGLE_CLIENT_ID:-}" ] || [ -n "${SMOKE_GOOGLE_CLIENT_ID:-}" ]; } &&
    { [ -n "${GOOGLE_CLIENT_SECRET:-}" ] || [ -n "${SMOKE_GOOGLE_CLIENT_SECRET:-}" ]; }
}

microsoft_ready() {
  [ -n "${SMOKE_MICROSOFT_REFRESH_TOKEN:-}" ] &&
    [ -n "${MICROSOFT_CLIENT_ID:-}" ] &&
    [ -n "${MICROSOFT_CLIENT_SECRET:-}" ]
}

apple_ready() {
  [ -n "${SMOKE_APPLE_EMAIL:-}" ] && [ -n "${SMOKE_APPLE_APP_PASSWORD:-}" ]
}

handle_google() {
  if google_ready; then
    run_kind google
  elif provider_expected google; then
    fail_kind google "SMOKE_GOOGLE_REFRESH_TOKEN or Google client id/secret absent (add SMOKE_GOOGLE_REFRESH_TOKEN to the provider-smoke Environment)"
  else
    skip_kind google "SMOKE_GOOGLE_REFRESH_TOKEN or Google client id/secret absent"
  fi
}

handle_microsoft() {
  if microsoft_ready; then
    run_kind microsoft
  elif provider_expected microsoft; then
    fail_kind microsoft "SMOKE_MICROSOFT_REFRESH_TOKEN or Microsoft client id/secret absent"
  else
    skip_kind microsoft "SMOKE_MICROSOFT_REFRESH_TOKEN or Microsoft client id/secret absent"
  fi
}

handle_apple() {
  if apple_ready; then
    run_kind apple
  elif provider_expected apple; then
    fail_kind apple "SMOKE_APPLE_EMAIL or SMOKE_APPLE_APP_PASSWORD absent"
  else
    skip_kind apple "SMOKE_APPLE_EMAIL or SMOKE_APPLE_APP_PASSWORD absent"
  fi
}

parse_expected_providers

handle_google
handle_microsoft
handle_apple

passed="${PASSED_PROVIDERS[*]-}"
skipped="${SKIPPED_PROVIDERS[*]-}"
failed="${FAILED_PROVIDERS[*]-}"
summary="live-provider-smoke passed=${passed:-none} skipped=${skipped:-none} failed=${failed:-none}"
echo "$summary"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  echo "$summary" >> "$GITHUB_STEP_SUMMARY"
fi

if [ "${#FAILED_PROVIDERS[@]}" -gt 0 ]; then
  notify "live-provider-smoke failed: ${FAILED_PROVIDERS[*]} (passed ${PASSED_PROVIDERS[*]:-none}, skipped ${SKIPPED_PROVIDERS[*]:-none})"
  exit 1
fi
