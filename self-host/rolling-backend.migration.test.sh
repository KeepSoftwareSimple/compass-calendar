#!/usr/bin/env bash
# Script-level checks for legacy-layout → api-proxy first cutover.
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

COMPOSE_LOG=$TMP/compose.log
DOCKER_LOG=$TMP/docker.log
: >"$COMPOSE_LOG"
: >"$DOCKER_LOG"

HEALTH_OK=0
LEGACY_RUNNING=legacy-c1
PROXY_FAIL_COUNT=0
PORT_HELD_AFTER_LEGACY_STOP=0
API_PROXY_UP=0
LEGACY_HOLDS_PORT=1

compose() {
  printf 'compose %s\n' "$*" >>"$COMPOSE_LOG"
  case "$1" in
    ps)
      if [ "$2" = "--status" ] && [ "$3" = "running" ] && [ "$4" = "--services" ]; then
        if [ "${API_PROXY_UP:-0}" -eq 1 ]; then
          printf '%s\n' api-proxy
        fi
        return 0
      fi
      if [ "$2" = "-a" ] && [ "$3" = "--format" ]; then
        if [ "${LEGACY_HOLDS_PORT:-0}" -eq 1 ]; then
          printf '%s\n' "backend 127.0.0.1:3000->3000/tcp"
        fi
        return 0
      fi
      return 0
      ;;
    up)
      service=${*: -1}
      case "$service" in
        api-proxy)
          if [ "${LEGACY_HOLDS_PORT:-0}" -eq 1 ] ||
            [ "${PORT_HELD_AFTER_LEGACY_STOP:-0}" -gt 0 ]; then
            PROXY_FAIL_COUNT=$((PROXY_FAIL_COUNT + 1))
            if [ "${PORT_HELD_AFTER_LEGACY_STOP:-0}" -gt 0 ]; then
              PORT_HELD_AFTER_LEGACY_STOP=$((PORT_HELD_AFTER_LEGACY_STOP - 1))
            fi
            return 1
          fi
          API_PROXY_UP=1
          HEALTH_OK=1
          return 0
          ;;
        backend-a|backend-b)
          return 0
          ;;
        *)
          return 0
          ;;
      esac
      ;;
    exec|stop|rm|restart|logs|pull)
      return 0
      ;;
    *)
      return 0
      ;;
  esac
}

docker() {
  printf 'docker %s\n' "$*" >>"$DOCKER_LOG"
  case "$1" in
    ps)
      if [ "$2" = "-q" ]; then
        if [ "${LEGACY_HOLDS_PORT:-0}" -eq 1 ]; then
          printf '%s\n' "$LEGACY_RUNNING"
        fi
        return 0
      fi
      return 0
      ;;
    stop)
      LEGACY_HOLDS_PORT=0
      PORT_HELD_AFTER_LEGACY_STOP=2
      return 0
      ;;
    start|rm)
      return 0
      ;;
    *)
      return 0
      ;;
  esac
}

check_health() {
  [ "$HEALTH_OK" -eq 1 ]
}

backend_slot_health_ok() {
  return 0
}

wait_for_backend_slot() {
  return 0
}

# shellcheck source=rolling-backend.sh
. "$INSTALL_DIR/rolling-backend.sh"

fail() {
  printf 'assertion failed: %s\n' "$*" >&2
  exit 1
}

if ! legacy_layout_needs_migration; then
  fail "expected legacy migration to be required"
fi

if ! migrate_from_legacy_backend; then
  fail "migration should succeed once legacy backend stops"
fi

if [ "$PROXY_FAIL_COUNT" -lt 1 ]; then
  fail "expected at least one api-proxy bind retry while the host port was busy"
fi

if legacy_layout_needs_migration; then
  fail "migration should complete with api-proxy running"
fi

if ! api_proxy_running; then
  fail "api-proxy should be running after migration"
fi

LEGACY_HOLDS_PORT=0
API_PROXY_UP=1
if ! migrate_from_legacy_backend; then
  fail "second migrate call should no-op successfully"
fi

printf 'ok legacy-proxy-migration-script-check\n'
