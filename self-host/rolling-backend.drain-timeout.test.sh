#!/usr/bin/env bash
# Drain timeout must still complete cutover: slot file updated, old slot stopped.
set -euo pipefail

ROOT=$(CDPATH= cd "$(dirname "$0")" && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

fail() {
  printf 'assertion failed: %s\n' "$*" >&2
  exit 1
}

INSTALL_DIR=$TMP/compass
mkdir -p "$INSTALL_DIR/api-proxy"
cp "$ROOT/rolling-backend.sh" "$INSTALL_DIR/"
cp "$ROOT/api-proxy/active-backend.conf" "$INSTALL_DIR/api-proxy/"

PROJECT_NAME=compass
ACTIVE_SLOT_FILE=$INSTALL_DIR/.backend-active-slot
UPSTREAM_FILE=$INSTALL_DIR/api-proxy/active-backend.conf
API_PROXY_BIND_RETRIES=3
PORT=3000

printf 'a\n' >"$ACTIVE_SLOT_FILE"

COMPASS_CUTOVER_STABLE_CHECKS=1
COMPASS_CUTOVER_STABLE_TIMEOUT_SEC=2
COMPASS_BACKEND_DRAIN_TIMEOUT_SEC=2
COMPASS_BACKEND_DRAIN_IDLE_SEC=1
export COMPASS_CUTOVER_STABLE_CHECKS COMPASS_CUTOVER_STABLE_TIMEOUT_SEC
export COMPASS_BACKEND_DRAIN_TIMEOUT_SEC COMPASS_BACKEND_DRAIN_IDLE_SEC

STOPPED_SLOT=""

compose() {
  case "$1" in
    ps)
      if [ "$2" = "--status" ] && [ "$3" = "running" ] && [ "$4" = "--services" ]; then
        printf '%s\n' api-proxy backend-a backend-b
        return 0
      fi
      return 0
      ;;
    up|exec|rm|restart|pull|logs)
      return 0
      ;;
    stop)
      for arg in "$@"; do
        case "$arg" in
          backend-a | backend-b) STOPPED_SLOT=$arg ;;
        esac
      done
      return 0
      ;;
    *)
      return 0
      ;;
  esac
}

docker() {
  return 0
}

check_health() {
  return 0
}

backend_slot_health_ok() {
  return 0
}

wait_for_backend_slot() {
  return 0
}

api_proxy_running() {
  return 0
}

legacy_layout_needs_migration() {
  return 1
}

migrate_from_legacy_backend() {
  return 0
}

# shellcheck source=rolling-backend.sh
. "$INSTALL_DIR/rolling-backend.sh"

backend_slot_established_connections() {
  printf '3'
}

if ! rolling_backend_update; then
  fail "rolling_backend_update should succeed after drain timeout"
fi

if [ "$(read_backend_active_slot)" != "b" ]; then
  fail "active slot file must be b after cutover"
fi

if [ "$STOPPED_SLOT" != "backend-a" ]; then
  fail "expected backend-a stopped after drain timeout (got ${STOPPED_SLOT})"
fi

printf 'ok cutover-drain-timeout-script-check\n'
