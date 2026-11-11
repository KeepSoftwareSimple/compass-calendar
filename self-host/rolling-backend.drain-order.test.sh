#!/usr/bin/env bash
# Cutover must not recreate the serving backend and must drain before stop.
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

COMPOSE_LOG=$TMP/compose.log
: >"$COMPOSE_LOG"

NO_RECREATE_PROXY=0
DRAIN_BEFORE_STOP=0
STOPPED_SLOT=""

compose() {
  printf 'compose %s\n' "$*" >>"$COMPOSE_LOG"
  case "$1" in
    ps)
      if [ "$2" = "--status" ] && [ "$3" = "running" ] && [ "$4" = "--services" ]; then
        printf '%s\n' api-proxy backend-a backend-b
        return 0
      fi
      return 0
      ;;
    up)
      if printf '%s' "$*" | grep -q -- '--no-recreate'; then
        if printf '%s' "$*" | grep -q 'api-proxy'; then
          NO_RECREATE_PROXY=1
        fi
      fi
      if printf '%s' "$*" | grep -q -- '--force-recreate'; then
        if printf '%s' "$*" | grep -q 'backend-a'; then
          fail "must not force-recreate the serving backend slot"
        fi
      fi
      return 0
      ;;
    exec|rm|restart|pull|logs)
      return 0
      ;;
    stop)
      for arg in "$@"; do
        case "$arg" in
          backend-a | backend-b) STOPPED_SLOT=$arg ;;
        esac
      done
      if [ "$DRAIN_BEFORE_STOP" -ne 1 ]; then
        fail "must drain backend slot before compose stop"
      fi
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

backend_slot_established_connections() {
  printf '0'
}

# shellcheck source=rolling-backend.sh
. "$INSTALL_DIR/rolling-backend.sh"

wait_for_backend_slot_drain() {
  DRAIN_BEFORE_STOP=1
  return 0
}

COMPASS_CUTOVER_STABLE_CHECKS=1
COMPASS_CUTOVER_STABLE_TIMEOUT_SEC=2
COMPASS_BACKEND_DRAIN_IDLE_SEC=1
export COMPASS_CUTOVER_STABLE_CHECKS COMPASS_CUTOVER_STABLE_TIMEOUT_SEC COMPASS_BACKEND_DRAIN_IDLE_SEC

if ! rolling_backend_update; then
  fail "rolling_backend_update should succeed"
fi

if [ "$NO_RECREATE_PROXY" -ne 1 ]; then
  fail "expected api-proxy up without recreate at cutover start"
fi

if ! grep -q 'server backend-b:3000 max_fails=0;' "$UPSTREAM_FILE"; then
  fail "cutover should point primary upstream at slot b"
fi

if ! grep -q 'server backend-a:3000 down max_fails=0;' "$UPSTREAM_FILE"; then
  fail "cutover should mark previous active slot down in upstream"
fi

if [ "$STOPPED_SLOT" != "backend-a" ]; then
  fail "expected backend-a stopped after drain (got ${STOPPED_SLOT})"
fi

if [ "$(read_backend_active_slot)" != "b" ]; then
  fail "active slot file should be b after cutover"
fi

printf 'ok cutover-drain-order-script-check\n'
