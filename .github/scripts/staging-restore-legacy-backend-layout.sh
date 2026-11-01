#!/usr/bin/env bash
# Revert staging hosts to the pre-proxy backend layout (legacy backend on :3000).
# Intended for staging cutover proof only. Runs on the remote host via SSH.
set -euo pipefail

INSTALL_DIR=${COMPASS_INSTALL_DIR:-$HOME/compass}
cd "$INSTALL_DIR"

if [ ! -x ./compass ] || [ ! -f compose.yaml ]; then
  echo "Missing Compass install under $INSTALL_DIR" >&2
  exit 1
fi

LEGACY_RESTORE_FILE="$INSTALL_DIR/compose.legacy-restore.yaml"
if [ ! -f "$LEGACY_RESTORE_FILE" ]; then
  echo "Missing $LEGACY_RESTORE_FILE (upload from repo self-host/)" >&2
  exit 1
fi

# shellcheck source=/dev/null
. "$INSTALL_DIR/config.sh"
[ -f "$INSTALL_DIR/compass.yaml" ] || {
  echo "Missing compass.yaml" >&2
  exit 1
}

export COMPASS_CONFIG_FILE="$INSTALL_DIR/compass.yaml"
export COMPASS_CONFIG_REVISION="$(config_file_revision)"
export COMPASS_VERSION="$(strip_quotes "$(read_config_value runtime.version)")"
export PORT="$(strip_quotes "$(read_config_value backend.port)")"
export COMPOSE_PROFILES="${COMPOSE_PROFILES-$(default_profiles)}"

compose_base() {
  case ",${COMPOSE_PROFILES}," in
    *,selfhosted,*)
      if [ -f "$INSTALL_DIR/compose.selfhosted.yaml" ]; then
        docker compose --project-name compass \
          -f "$INSTALL_DIR/compose.yaml" \
          -f "$INSTALL_DIR/compose.selfhosted.yaml" "$@"
        return
      fi
      ;;
  esac
  docker compose --project-name compass -f "$INSTALL_DIR/compose.yaml" "$@"
}

echo "Stopping proxy layout services..."
compose_base stop -t 60 api-proxy backend-a backend-b 2>/dev/null || true
compose_base rm -f api-proxy backend-a backend-b 2>/dev/null || true
rm -f "$INSTALL_DIR/.backend-active-slot"
rm -f "$INSTALL_DIR/api-proxy/active-backend.conf"

legacy_id=$(docker ps -aq \
  --filter label=com.docker.compose.project=compass \
  --filter label=com.docker.compose.service=backend)
if [ -n "$legacy_id" ]; then
  docker rm -f $legacy_id >/dev/null 2>&1 || true
fi

echo "Starting legacy backend on 127.0.0.1:${PORT:-3000}..."
docker compose --project-name compass \
  -f "$LEGACY_RESTORE_FILE" \
  up -d --wait backend

if command -v curl >/dev/null 2>&1; then
  curl -fsS "http://127.0.0.1:${PORT:-3000}/api/health" >/dev/null
elif command -v wget >/dev/null 2>&1; then
  wget -q -O /dev/null "http://127.0.0.1:${PORT:-3000}/api/health"
else
  echo "curl or wget required for health probe" >&2
  exit 1
fi

echo "Legacy backend layout restored (backend service bound to host port ${PORT:-3000})."
