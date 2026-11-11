#!/bin/sh
# Connection probe errors must not count as drained before the drain cap elapses.
# Run under plain POSIX sh (rolling-backend.sh is #!/bin/sh without pipefail).
set -eu

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
COMPASS_BACKEND_DRAIN_TIMEOUT_SEC=3
COMPASS_BACKEND_DRAIN_IDLE_SEC=1
export COMPASS_CUTOVER_STABLE_CHECKS COMPASS_CUTOVER_STABLE_TIMEOUT_SEC
export COMPASS_BACKEND_DRAIN_TIMEOUT_SEC COMPASS_BACKEND_DRAIN_IDLE_SEC

compose() {
  case "$1" in
    ps)
      if [ "$2" = "--status" ] && [ "$3" = "running" ] && [ "$4" = "--services" ]; then
        printf '%s\n' api-proxy backend-a backend-b
        return 0
      fi
      return 0
      ;;
    up|stop|rm|restart|pull|logs|exec)
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
  return 1
}

stderr_file=$TMP/stderr.log
if ! rolling_backend_update 2>"$stderr_file"; then
  fail "rolling_backend_update should succeed when drain probe fails"
fi

if grep -q 'backend-a drained' "$stderr_file"; then
  fail "probe failures must not report early drain"
fi

probe_failures=$(grep -c 'connection probe failed' "$stderr_file" || true)
if [ "$probe_failures" -lt 2 ]; then
  fail "expected multiple probe failures before drain cap (got ${probe_failures})"
fi

if ! grep -q 'drain timeout' "$stderr_file"; then
  fail "expected drain timeout log when probe keeps failing"
fi

printf 'ok cutover-drain-probe-failure-script-check\n'
