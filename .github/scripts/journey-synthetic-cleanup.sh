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

CLI_ARGS=(--environment "$ENVIRONMENT")
if [ "$DISCOVER" = "true" ]; then
  CLI_ARGS+=(--discover-pending-file)
  if [ -z "$EMAILS" ]; then
    RESULTS_DIR="e2e/test-results"
    if [ "$ENVIRONMENT" = "production" ]; then
      PENDING_FILE="$RESULTS_DIR/prod-journey/journey-pending-account.json"
    else
      PENDING_FILE="$RESULTS_DIR/staging-journey/journey-pending-account.json"
    fi
    if [ -f "$PENDING_FILE" ]; then
      EMAILS=$(bun -e "const j=JSON.parse(require('fs').readFileSync('$PENDING_FILE','utf8')); process.stdout.write(j.email??'');")
    fi
  fi
fi
if [ -n "$EMAILS" ]; then
  CLI_ARGS+=(--emails "$EMAILS")
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

bun run cli journey-synthetic-cleanup "${CLI_ARGS[@]}" --apply --stripe-only
