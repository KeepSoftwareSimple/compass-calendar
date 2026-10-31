#!/usr/bin/env bash
# Forced failed cutover: unstable proxy health after upstream switch must roll
# back to the previously active slot and keep serving through api-proxy.
set -euo pipefail

ROOT=$(CDPATH= cd "$(dirname "$0")" && pwd)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

INSTALL_DIR=$TMP/compass
mkdir -p "$INSTALL_DIR/api-proxy"
cp "$ROOT/rolling-backend.sh" "$INSTALL_DIR/"
cp "$ROOT/api-proxy/active-backend.conf" "$INSTALL_DIR/api-proxy/"

PROJECT_NAME=compass
ACTIVE_SLOT_FILE=$INSTALL_DIR/.backend-active-slot
UPSTREAM_FILE=$INSTALL_DIR/api-proxy/active-backend.conf
API_PROXY_BIND_RETRIES=3
PORT=3000

printf 'b\n' >"$ACTIVE_SLOT_FILE"

COMPOSE_LOG=$TMP/compose.log
: >"$COMPOSE_LOG"

STOPPED_SLOT=""
UNSTABLE_AFTER_SWITCH=0

compose() {
  printf 'compose %s\n' "$*" >>"$COMPOSE_LOG"
  case "$1" in
    ps)
      if [ "$2" = "--status" ] && [ "$3" = "running" ] && [ "$4" = "--services" ]; then
        printf '%s\n' api-proxy
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
  if [ "$UNSTABLE_AFTER_SWITCH" -eq 1 ]; then
    return 1
  fi
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

fail() {
  printf 'assertion failed: %s\n' "$*" >&2
  exit 1
}

COMPASS_CUTOVER_STABLE_CHECKS=1
COMPASS_CUTOVER_STABLE_TIMEOUT_SEC=2
export COMPASS_CUTOVER_STABLE_CHECKS COMPASS_CUTOVER_STABLE_TIMEOUT_SEC

write_upstream_for_slot() {
  slot=$1
  umask 077
  printf 'set $backend_upstream backend-%s:3000;\n' "$slot" > "$UPSTREAM_FILE"
  if [ "$slot" = "a" ] && [ "$(read_backend_active_slot)" = "b" ]; then
    UNSTABLE_AFTER_SWITCH=1
  fi
}

if rolling_backend_update; then
  fail "rolling_backend_update should fail when proxy health is unstable after switch"
fi

if [ "$UNSTABLE_AFTER_SWITCH" -ne 1 ]; then
  fail "expected upstream switch to inactive slot a before rollback"
fi

if ! grep -q 'backend-b:3000' "$UPSTREAM_FILE"; then
  fail "rollback should restore upstream to active slot b"
fi

if [ "$STOPPED_SLOT" != "backend-a" ]; then
  fail "rollback should stop backend-a (got ${STOPPED_SLOT})"
fi

UNSTABLE_AFTER_SWITCH=0
if ! check_health; then
  fail "proxy health should be ok again on the old active slot after rollback"
fi

if [ "$(read_backend_active_slot)" != "b" ]; then
  fail "active slot file must remain b after failed cutover"
fi

printf 'ok cutover-rollback-script-check\n'
