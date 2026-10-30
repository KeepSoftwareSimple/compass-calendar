#!/usr/bin/env bash
# run_compose_wait must exec a real binary under GNU timeout, not the compose() shell function.
set -euo pipefail

ROOT=$(CDPATH= cd "$(dirname "$0")" && pwd)
HELPER="$ROOT/compass"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

if grep -E 'timeout "\$wait_sec" compose ' "$HELPER" >/dev/null 2>&1; then
  printf '%s\n' "compose-wait-timeout: timeout still wraps the compose shell function" >&2
  exit 1
fi

grep -q 'timeout "$wait_sec" "$0" __internal_compose_docker' "$HELPER"

INSTALL_DIR=$TMP/compass
BIN_DIR=$TMP/bin
DOCKER_LOG=$TMP/docker.log
TIMEOUT_LOG=$TMP/timeout.log
mkdir -p "$INSTALL_DIR" "$BIN_DIR"
: >"$DOCKER_LOG"
: >"$TIMEOUT_LOG"

cp "$ROOT/config.sh" "$ROOT/rolling-backend.sh" "$ROOT/compose.yaml" \
  "$ROOT/compose.selfhosted.yaml" "$HELPER" "$INSTALL_DIR/"
cat >"$INSTALL_DIR/compass.yaml" <<'YAML'
runtime:
  version: test
web:
  port: 9080
  image: example/web:test
backend:
  port: 3000
sync:
  port: 3001
  mongoUri: mongodb://mongo:27017/compass_sync
YAML

cat >"$BIN_DIR/timeout" <<EOF
#!/bin/sh
shift
printf '%s\n' "\$*" >> "$TIMEOUT_LOG"
exec "\$@"
EOF
chmod +x "$BIN_DIR/timeout"

cat >"$BIN_DIR/docker" <<EOF
#!/bin/sh
printf 'docker %s\n' "\$*" >> "$DOCKER_LOG"
case "\$1:\$2" in
  compose:version) exit 0 ;;
  compose:*) exit 0 ;;
esac
exit 0
EOF
chmod +x "$BIN_DIR/docker"

run_internal() {
  : >"$DOCKER_LOG"
  COMPOSE_PROFILES=$1 \
    PATH="$BIN_DIR:$PATH" \
    sh "$INSTALL_DIR/compass" __internal_compose_docker ps >/dev/null
}

assert_cloud_compose() {
  grep -q 'docker compose --project-name compass -f .*/compose.yaml ' "$DOCKER_LOG"
  if grep -q compose.selfhosted.yaml "$DOCKER_LOG"; then
    printf '%s\n' "compose-wait-timeout: cloud profile must not load selfhosted overlay" >&2
    exit 1
  fi
}

assert_selfhosted_compose() {
  grep -q 'docker compose --project-name compass -f .*/compose.yaml -f .*/compose.selfhosted.yaml ' "$DOCKER_LOG"
}

exercise_timeout_wrapper() {
  local profiles=$1
  : >"$DOCKER_LOG"
  : >"$TIMEOUT_LOG"
  COMPOSE_PROFILES=$profiles \
    PATH="$BIN_DIR:$PATH" \
    sh -c 'timeout 30 "$0" __internal_compose_docker up -d --remove-orphans --wait web sync' \
    "$INSTALL_DIR/compass" >/dev/null

  grep -q '__internal_compose_docker up -d --remove-orphans --wait web sync' "$TIMEOUT_LOG" ||
    {
      printf '%s\n' "compose-wait-timeout: timeout did not receive __internal_compose_docker argv" >&2
      exit 1
    }
}

run_internal sync
assert_cloud_compose

run_internal selfhosted,sync
assert_selfhosted_compose

exercise_timeout_wrapper sync
if grep -q compose.selfhosted.yaml "$DOCKER_LOG"; then
  printf '%s\n' "compose-wait-timeout: staging-cloud timeout path loaded selfhosted overlay" >&2
  exit 1
fi

exercise_timeout_wrapper selfhosted,sync
assert_selfhosted_compose

printf '%s\n' "ok compose-wait-timeout-script-check"
