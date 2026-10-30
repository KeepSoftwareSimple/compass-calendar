#!/bin/sh
# Blue/green backend cutover for self-host deploys. Sourced from compass after
# config.sh is loaded. Requires compose() and set_compose_env from compass.

ACTIVE_SLOT_FILE=${COMPASS_BACKEND_ACTIVE_SLOT_FILE:-"$INSTALL_DIR/.backend-active-slot"}
UPSTREAM_FILE=${COMPASS_BACKEND_UPSTREAM_FILE:-"$INSTALL_DIR/api-proxy/active-backend.conf"}

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

ensure_api_proxy() {
  write_upstream_for_slot "$(read_backend_active_slot)"
  compose up -d api-proxy || return 1
  wait_for_backend_slot "$(read_backend_active_slot)" || return 1
}

rolling_backend_update() {
  active=$(read_backend_active_slot)
  inactive=$(write_backend_inactive_slot "$active") || return 1

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
