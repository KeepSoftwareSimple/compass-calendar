#!/bin/sh
# Blue/green backend cutover for self-host deploys. Sourced from compass after
# config.sh is loaded. Requires compose() and set_compose_env from compass.

ACTIVE_SLOT_FILE=${COMPASS_BACKEND_ACTIVE_SLOT_FILE:-"$INSTALL_DIR/.backend-active-slot"}
UPSTREAM_FILE=${COMPASS_BACKEND_UPSTREAM_FILE:-"$INSTALL_DIR/api-proxy/active-backend.conf"}
API_PROXY_BIND_RETRIES=${COMPASS_API_PROXY_BIND_RETRIES:-15}

read_backend_active_slot() {
  if [ -f "$ACTIVE_SLOT_FILE" ]; then
    slot=$(tr -d '[:space:]' < "$ACTIVE_SLOT_FILE")
    case "$slot" in
      a | b) printf '%s\n' "$slot"; return 0 ;;
    esac
  fi
  printf '%s\n' "a"
}

write_backend_inactive_slot() {
  active=$1
  case "$active" in
    a) printf '%s\n' "b" ;;
    b) printf '%s\n' "a" ;;
    *) return 1 ;;
  esac
}

write_upstream_for_slot() {
  slot=$1
  umask 077
  printf 'server backend-%s:3000;\n' "$slot" > "$UPSTREAM_FILE"
}

reload_api_proxy() {
  compose exec -T api-proxy nginx -s reload >/dev/null 2>&1 ||
    compose restart api-proxy >/dev/null 2>&1
}

backend_slot_health_ok() {
  slot=$1
  compose exec -T "backend-$slot" \
    bun -e "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))" \
    >/dev/null 2>&1
}

wait_for_backend_slot() {
  slot=$1
  tries=90
  while [ "$tries" -gt 0 ]; do
    if backend_slot_health_ok "$slot"; then
      return 0
    fi
    tries=$((tries - 1))
    sleep 2
  done
  return 1
}

api_proxy_running() {
  compose ps --status running --services 2>/dev/null | grep -qx api-proxy
}

legacy_backend_container_id() {
  docker ps -q \
    --filter "label=com.docker.compose.project=${PROJECT_NAME}" \
    --filter "label=com.docker.compose.service=backend"
}

legacy_backend_publishing_port() {
  host_port=${PORT:-3000}
  compose ps -a --format '{{.Service}} {{.Ports}}' 2>/dev/null |
    grep -E "^backend .*127\\.0\\.0\\.1:${host_port}->" >/dev/null 2>&1
}

legacy_layout_needs_migration() {
  if api_proxy_running; then
    return 1
  fi
  if legacy_backend_publishing_port; then
    return 0
  fi
  [ -n "$(legacy_backend_container_id)" ]
}

up_api_proxy_with_bind_retry() {
  try=1
  while [ "$try" -le "$API_PROXY_BIND_RETRIES" ]; do
    if compose up -d api-proxy 2>/dev/null; then
      return 0
    fi
    try=$((try + 1))
    sleep 1
  done
  return 1
}

wait_for_host_api_health() {
  tries=60
  while [ "$tries" -gt 0 ]; do
    if check_health; then
      return 0
    fi
    tries=$((tries - 1))
    sleep 1
  done
  return 1
}

stop_legacy_backend_publishing_port() {
  legacy_id=$(legacy_backend_container_id)
  if [ -n "$legacy_id" ]; then
    docker stop -t 60 "$legacy_id"
    return $?
  fi
  compose stop -t 45 backend >/dev/null 2>&1 || true
  compose rm -f backend >/dev/null 2>&1 || true
  return 0
}

rollback_legacy_cutover() {
  legacy_id=$1
  active=$2
  compose stop -t 10 api-proxy >/dev/null 2>&1 || true
  compose rm -f api-proxy >/dev/null 2>&1 || true
  compose stop -t 10 "backend-$active" >/dev/null 2>&1 || true
  if [ -n "$legacy_id" ]; then
    docker start "$legacy_id" >/dev/null 2>&1 || return 1
    wait_for_host_api_health || return 1
  fi
  return 0
}

# One-time cutover from the pre-proxy `backend` service that still bound
# 127.0.0.1:${PORT}. After compose.yaml drops the `backend` service, stop the
# orphan via docker labels; only free the host port once the target slot is
# healthy, then bind api-proxy with retries and roll back on failure.
migrate_from_legacy_backend() {
  if ! legacy_layout_needs_migration; then
    return 0
  fi

  legacy_id=$(legacy_backend_container_id)
  active=$(read_backend_active_slot)
  write_upstream_for_slot "$active"
  compose up -d --no-deps "backend-$active" || return 1
  if ! wait_for_backend_slot "$active"; then
    compose ps -a "backend-$active" >&2 || true
    compose logs --tail=80 "backend-$active" >&2 || true
    return 1
  fi

  if ! stop_legacy_backend_publishing_port; then
    return 1
  fi

  if ! up_api_proxy_with_bind_retry; then
    rollback_legacy_cutover "$legacy_id" "$active" || return 1
    return 1
  fi

  if ! wait_for_host_api_health; then
    compose ps -a api-proxy "backend-$active" >&2 || true
    compose logs --tail=80 api-proxy "backend-$active" >&2 || true
    rollback_legacy_cutover "$legacy_id" "$active" || return 1
    return 1
  fi

  if [ -n "$legacy_id" ]; then
    docker rm -f "$legacy_id" >/dev/null 2>&1 || true
  else
    compose rm -f backend >/dev/null 2>&1 || true
  fi
  printf '%s\n' "$active" > "$ACTIVE_SLOT_FILE"
  return 0
}

ensure_api_proxy() {
  migrate_from_legacy_backend || return 1
  write_upstream_for_slot "$(read_backend_active_slot)"
  compose up -d api-proxy || return 1
  wait_for_backend_slot "$(read_backend_active_slot)" || return 1
}

rolling_backend_update() {
  active=$(read_backend_active_slot)
  inactive=$(write_backend_inactive_slot "$active") || return 1

  migrate_from_legacy_backend || return 1

  write_upstream_for_slot "$active"
  compose up -d "backend-$active" api-proxy || return 1
  if ! wait_for_backend_slot "$active"; then
    compose ps -a "backend-$active" api-proxy >&2 || true
    compose logs --tail=80 "backend-$active" api-proxy >&2 || true
    return 1
  fi

  if ! compose up -d --force-recreate --no-deps "backend-$inactive"; then
    compose ps -a "backend-$inactive" >&2 || true
    compose logs --tail=80 "backend-$inactive" >&2 || true
    return 1
  fi

  if ! wait_for_backend_slot "$inactive"; then
    compose ps -a "backend-$inactive" >&2 || true
    compose logs --tail=80 "backend-$inactive" >&2 || true
    compose stop -t 10 "backend-$inactive" >/dev/null 2>&1 || true
    return 1
  fi

  write_upstream_for_slot "$inactive"
  reload_api_proxy

  if ! check_health; then
    write_upstream_for_slot "$active"
    reload_api_proxy
    compose stop -t 10 "backend-$inactive" >/dev/null 2>&1 || true
    return 1
  fi

  compose stop -t 60 "backend-$active" || return 1
  printf '%s\n' "$inactive" > "$ACTIVE_SLOT_FILE"
  return 0
}
