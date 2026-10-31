#!/usr/bin/env bash
# Nightly staging user-journey Playwright run. Targets staging only.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT"

PROVIDER=${STAGING_JOURNEY_PROVIDER:-}
if [ -z "$PROVIDER" ]; then
  echo "::error::STAGING_JOURNEY_PROVIDER is unset (expected google, microsoft, or apple)"
  exit 1
fi

PREFIX="STAGING_JOURNEY_${PROVIDER^^}_EMAIL"
PASSWORD_KEY="STAGING_JOURNEY_${PROVIDER^^}_PASSWORD"
if [ -z "${!PREFIX:-}" ] || [ -z "${!PASSWORD_KEY:-}" ]; then
  echo "::error::Missing ${PREFIX} or ${PASSWORD_KEY} for staging journey leg ${PROVIDER}"
  exit 1
fi

export STAGING_JOURNEY_ENABLED=1
export STAGING_BASE_URL="${STAGING_BASE_URL:-https://staging.compasscalendar.com}"

bunx playwright install chromium
if [ "${STAGING_JOURNEY_ARTIFACT_PROBE:-}" = "1" ]; then
  bunx playwright test --config e2e/playwright.staging-journey-probe.config.ts
else
  bunx playwright test --config e2e/playwright.staging-journey.config.ts
fi
