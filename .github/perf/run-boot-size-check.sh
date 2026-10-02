#!/usr/bin/env bash
# Run apps/calendar-web/build.ts the way .github/docker/Dockerfile.web does for
# cloud staging/production images: compass.boot-size.yaml, OAuth build-args as
# env vars, and no git (BUILD_VERSION from COMPASS_BUILD_REF).
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo_root"

export COMPASS_CONFIG_FILE="${COMPASS_CONFIG_FILE:-$repo_root/.github/perf/compass.boot-size.yaml}"
# Semver-shaped ref passed as COMPASS_BUILD_REF in _deploy-environment.yml.
export COMPASS_BUILD_REF="${COMPASS_BUILD_REF:-99.99.99}"
# Dockerfile.web ENV lines; not written into compass.yaml but inlined in the bundle.
export MICROSOFT_CLIENT_ID="${MICROSOFT_CLIENT_ID:-00000000-0000-0000-0000-000000000000}"
export APPLE_SERVICES_ID="${APPLE_SERVICES_ID:-com.compasscalendar.staging.signin}"

# oven/bun build images do not ship git; getBuildHash() falls back to COMPASS_BUILD_REF.
no_git_bin="${RUNNER_TEMP:-/tmp}/compass-no-git-bin"
mkdir -p "$no_git_bin"
if [[ ! -x "$no_git_bin/git" ]]; then
  printf '#!/bin/sh\nexit 1\n' >"$no_git_bin/git"
  chmod +x "$no_git_bin/git"
fi
export PATH="$no_git_bin:$PATH"

cd apps/calendar-web
exec bun run build.ts
