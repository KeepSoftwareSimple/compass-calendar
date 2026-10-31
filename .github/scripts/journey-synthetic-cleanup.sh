#!/usr/bin/env bash
# Manual synthetic journey account cleanup (Tyler-approved email patterns only).
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT"

ENVIRONMENT=${JOURNEY_CLEANUP_ENVIRONMENT:-}
EMAILS=${JOURNEY_CLEANUP_EMAILS:-}
DRY_RUN=${JOURNEY_CLEANUP_DRY_RUN:-true}
DISCOVER=${JOURNEY_CLEANUP_DISCOVER_PENDING:-false}

if [ -z "$ENVIRONMENT" ]; then
  echo "::error::JOURNEY_CLEANUP_ENVIRONMENT is required (staging or production)"
  exit 1
fi

pending_file_for_environment() {
  local results_dir="e2e/test-results"
  if [ "$ENVIRONMENT" = "production" ]; then
    echo "$results_dir/prod-journey/journey-pending-account.json"
  else
    echo "$results_dir/staging-journey/journey-pending-account.json"
  fi
}

if [ "$DISCOVER" = "true" ] && [ -z "$EMAILS" ]; then
  PENDING_FILE=$(pending_file_for_environment)
  if [ -f "$PENDING_FILE" ]; then
    EMAILS=$(bun -e "const j=JSON.parse(require('fs').readFileSync('$PENDING_FILE','utf8')); process.stdout.write(j.email??'');")
  fi
fi

CLI_ARGS=(--environment "$ENVIRONMENT")
if [ -n "$EMAILS" ]; then
  CLI_ARGS+=(--emails "$EMAILS")
fi
if [ "$DISCOVER" = "true" ]; then
  CLI_ARGS+=(--discover-pending-file)
fi

if [ "$DRY_RUN" = "true" ]; then
  bun run cli journey-synthetic-cleanup "${CLI_ARGS[@]}"
  exit 0
fi

bun run cli journey-synthetic-cleanup "${CLI_ARGS[@]}" --validate-only
export JOURNEY_MANUAL_CLEANUP_UI=1
export JOURNEY_MANUAL_CLEANUP_ENV=$ENVIRONMENT
export JOURNEY_MANUAL_CLEANUP_EMAILS=$EMAILS

if [ "$ENVIRONMENT" = "production" ]; then
  export PROD_BASE_URL="${PROD_BASE_URL:-https://compasscalendar.com}"
else
  export STAGING_BASE_URL="${STAGING_BASE_URL:-https://staging.compasscalendar.com}"
fi

bunx playwright install chromium
bunx playwright test --config e2e/playwright.journey-manual-cleanup.config.ts

# Playwright removes the pending file; pass the resolved email explicitly.
STRIPE_ARGS=(--environment "$ENVIRONMENT" --apply --stripe-only)
if [ -n "$EMAILS" ]; then
  STRIPE_ARGS+=(--emails "$EMAILS")
elif [ "$DISCOVER" = "true" ]; then
  STRIPE_ARGS+=(--discover-pending-file)
fi
bun run cli journey-synthetic-cleanup "${STRIPE_ARGS[@]}"
