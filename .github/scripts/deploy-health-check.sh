#!/usr/bin/env bash

set -uo pipefail

FAILURES=()
DETAILS=()

check_passed() {
  printf 'ok %s\n' "$1"
}

record_failure() {
  local name=$1
  local detail=${2:-}

  FAILURES+=("$name")
  detail=$(printf '%s' "$detail" | tr '\r' '\n' | sed -E \
    -e 's#mongodb(\+srv)?://[^[:space:]"'"'"']+#mongodb://[redacted]#g' \
    -e 's#postgres(ql)?://[^[:space:]"'"'"']+#postgres://[redacted]#g' \
    -e 's#(password|token|secret|key)=([^[:space:]&]+)#\1=[redacted]#gi' |
    tail -c 700)
  DETAILS+=("$name: $detail")
  printf 'failed %s: %s\n' "$name" "$detail" >&2
}

run_check() {
  local name=$1
  shift

  local output
  if output=$("$@" 2>&1); then
    check_passed "$name"
    return 0
  fi

  record_failure "$name" "$output"
  return 1
}

json_escape() {
  sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e ':a;N;$!ba;s/\n/\\n/g'
}

write_report() {
  local report_file=${HEALTH_CHECK_REPORT_FILE:-deploy-health-check-report.txt}

  {
    printf 'environment=%s\n' "${ENVIRONMENT:-unknown}"
    printf 'release_tag=%s\n' "${RELEASE_TAG:-${TAG:-unknown}}"
    printf 'failed_checks=%s\n' "$(IFS=,; printf '%s' "${FAILURES[*]}")"
    printf '\n'
    printf '%s\n' "${DETAILS[@]}"
  } > "$report_file"
}

send_discord_alert() {
  [ "${#FAILURES[@]}" -gt 0 ] || return 0
  [ -n "${DISCORD_DEPLOY_WEBHOOK_URL:-}" ] || return 0

  local report_file=${HEALTH_CHECK_REPORT_FILE:-deploy-health-check-report.txt}
  local failed detail message escaped
  failed=$(IFS=', '; printf '%s' "${FAILURES[*]}")
  detail=$(tail -c 1400 "$report_file" 2>/dev/null || true)
  message=$(cat <<MSG
Compass deploy health check failed
Environment: ${ENVIRONMENT:-unknown}
Release: ${RELEASE_TAG:-${TAG:-unknown}}
Run: ${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY:-SwitchbackTech/compass}/actions/runs/${GITHUB_RUN_ID:-unknown}
Failed checks: ${failed}

${detail}
MSG
)
  escaped=$(printf '%s' "$message" | json_escape)
  curl -fsS \
    -H 'Content-Type: application/json' \
    -d "{\"content\":\"${escaped}\"}" \
    "$DISCORD_DEPLOY_WEBHOOK_URL" >/dev/null
}

finish() {
  if [ "${#FAILURES[@]}" -eq 0 ]; then
    return 0
  fi

  write_report
  send_discord_alert || true
  return 1
}

require_env() {
  local name=$1
  if [ -z "${!name:-}" ]; then
    printf 'missing required environment variable: %s\n' "$name" >&2
    return 1
  fi
}

curl_to_files() {
  local url=$1
  local headers_file=$2
  local body_file=$3

  curl -fsS -L --max-time 20 -D "$headers_file" -o "$body_file" "$url"
}

is_local_url() {
  case "$1" in
    http://localhost:*|http://localhost/*|http://127.0.0.1:*|http://127.0.0.1/*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

validate_frontend_files() {
  local headers_file=$1
  local body_file=$2
  local status content_type

  status=$(awk 'tolower($0) ~ /^http\// { code=$2 } END { print code }' "$headers_file" | tr -d '\r')
  if [[ ! $status =~ ^2[0-9][0-9]$ ]]; then
    record_failure "frontend-http" "HTTP status ${status:-missing}"
    return 1
  fi
  check_passed "frontend-http"

  content_type=$(awk 'BEGIN { IGNORECASE=1 } /^content-type:/ { print $0 }' "$headers_file" | tail -n 1 | tr -d '\r')
  if [[ ! $content_type =~ text/html ]] && [[ ! $content_type =~ application/xhtml\+xml ]]; then
    record_failure "frontend-content-type" "${content_type:-missing content-type}"
    return 1
  fi
  check_passed "frontend-content-type"

  if [ ! -s "$body_file" ]; then
    record_failure "frontend-body" "empty response body"
    return 1
  fi

  if ! grep -Eiq '<html|<!doctype html' "$body_file"; then
    record_failure "frontend-body" "missing HTML document marker"
    return 1
  fi
  check_passed "frontend-body"
}

validate_frontend() {
  local temp_dir headers_file body_file

  if [ -n "${FRONTEND_URL:-}" ] && is_local_url "$FRONTEND_URL" && [ -n "${SSH_TARGET:-}" ]; then
    validate_remote_frontend
    return $?
  fi

  if [ -n "${FRONTEND_HEADERS_FILE:-}" ] && [ -n "${FRONTEND_BODY_FILE:-}" ]; then
    validate_frontend_files "$FRONTEND_HEADERS_FILE" "$FRONTEND_BODY_FILE"
    local result=$?
    [ -n "${SUPPRESS_FRONTEND_FINISH:-}" ] && return "$result"
    finish
    return $?
  fi

  require_env FRONTEND_URL || return 1
  temp_dir=$(mktemp -d)
  headers_file="$temp_dir/frontend.headers"
  body_file="$temp_dir/frontend.body"

  if ! curl_to_files "$FRONTEND_URL" "$headers_file" "$body_file"; then
    record_failure "frontend-http" "curl failed for $FRONTEND_URL"
    rm -rf "$temp_dir"
    [ -n "${SUPPRESS_FRONTEND_FINISH:-}" ] && return 1
    finish
    return $?
  fi

  validate_frontend_files "$headers_file" "$body_file"
  local result=$?
  rm -rf "$temp_dir"
  [ -n "${SUPPRESS_FRONTEND_FINISH:-}" ] && return "$result"
  finish
}

validate_remote_frontend() {
  require_env FRONTEND_URL || return 1

  ssh_remote "FRONTEND_URL=$(printf '%q' "$FRONTEND_URL") bash -se" <<'REMOTE'
set -euo pipefail
temp_dir=$(mktemp -d)
headers_file="$temp_dir/frontend.headers"
body_file="$temp_dir/frontend.body"
cleanup() {
  rm -rf "$temp_dir"
}
trap cleanup EXIT

curl -fsS -L --max-time 20 -D "$headers_file" -o "$body_file" "$FRONTEND_URL"
status=$(awk 'tolower($0) ~ /^http\// { code=$2 } END { print code }' "$headers_file" | tr -d '\r')
if ! [[ $status =~ ^2[0-9][0-9]$ ]]; then
  printf 'failed frontend-http: HTTP status %s\n' "${status:-missing}" >&2
  exit 1
fi
printf 'ok frontend-http\n'

content_type=$(awk 'BEGIN { IGNORECASE=1 } /^content-type:/ { print $0 }' "$headers_file" | tail -n 1 | tr -d '\r')
if ! [[ $content_type =~ text/html ]] && ! [[ $content_type =~ application/xhtml\+xml ]]; then
  printf 'failed frontend-content-type: %s\n' "${content_type:-missing content-type}" >&2
  exit 1
fi
printf 'ok frontend-content-type\n'

if [ ! -s "$body_file" ]; then
  printf 'failed frontend-body: empty response body\n' >&2
  exit 1
fi

if ! grep -Eiq '<html|<!doctype html' "$body_file"; then
  printf 'failed frontend-body: missing HTML document marker\n' >&2
  exit 1
fi
printf 'ok frontend-body\n'
REMOTE
}

expected_version() {
  local version=${EXPECTED_VERSION:-${RELEASE_TAG:-${TAG:-${INPUT_TAG:-}}}}
  version=${version#v}

  if [ -z "$version" ]; then
    printf 'missing expected version; set EXPECTED_VERSION or RELEASE_TAG\n' >&2
    return 1
  fi

  printf '%s\n' "$version"
}

extract_version_json() {
  sed -nE 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' | head -n 1
}

validate_frontend_version_body() {
  local body_file=$1
  local expected actual

  expected=$(expected_version) || return 1
  actual=$(extract_version_json < "$body_file")

  if [ -z "$actual" ]; then
    record_failure "frontend-version" "missing version field"
    return 1
  fi

  if [ "$actual" != "$expected" ]; then
    record_failure "frontend-version" "expected $expected, got $actual"
    return 1
  fi

  check_passed "frontend-version"
}

validate_frontend_version() {
  local temp_dir body_file url result output

  if [ -n "${FRONTEND_VERSION_BODY_FILE:-}" ]; then
    validate_frontend_version_body "$FRONTEND_VERSION_BODY_FILE"
    result=$?
    [ -n "${SUPPRESS_FRONTEND_FINISH:-}" ] && return "$result"
    finish
    return $?
  fi

  require_env FRONTEND_URL || return 1
  url="${FRONTEND_URL%/}/version.json"

  if is_local_url "$url" && [ -n "${SSH_TARGET:-}" ]; then
    output=$(validate_remote_frontend_version 2>&1)
    result=$?
    if [ "$result" -eq 0 ]; then
      printf '%s\n' "$output"
    else
      record_failure "frontend-version" "$output"
    fi
    [ -n "${SUPPRESS_FRONTEND_FINISH:-}" ] && return "$result"
    finish
    return $?
  fi

  temp_dir=$(mktemp -d)
  body_file="$temp_dir/version.json"
  if ! curl -fsS -L --max-time 20 -o "$body_file" "$url"; then
    record_failure "frontend-version" "curl failed for $url"
    rm -rf "$temp_dir"
    [ -n "${SUPPRESS_FRONTEND_FINISH:-}" ] && return 1
    finish
    return $?
  fi

  validate_frontend_version_body "$body_file"
  result=$?
  rm -rf "$temp_dir"
  [ -n "${SUPPRESS_FRONTEND_FINISH:-}" ] && return "$result"
  finish
}

validate_remote_frontend_version() {
  local expected

  require_env FRONTEND_URL || return 1
  expected=$(expected_version) || return 1

  ssh_remote "FRONTEND_URL=$(printf '%q' "$FRONTEND_URL") EXPECTED_VERSION=$(printf '%q' "$expected") bash -se" <<'REMOTE'
set -euo pipefail
url="${FRONTEND_URL%/}/version.json"
body=$(curl -fsS -L --max-time 20 "$url")
actual=$(printf '%s' "$body" | sed -nE 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' | head -n 1)
if [ -z "$actual" ]; then
  printf 'missing version field\n' >&2
  exit 1
fi
if [ "$actual" != "$EXPECTED_VERSION" ]; then
  printf 'expected %s, got %s\n' "$EXPECTED_VERSION" "$actual" >&2
  exit 1
fi
printf 'ok frontend-version\n'
REMOTE
}

validate_backend_health() {
  require_env BACKEND_API_URL || return 1

  local url body
  url="${BACKEND_API_URL%/}/health"
  if is_local_url "$url" && [ -n "${SSH_TARGET:-}" ]; then
    body=$(ssh_remote "curl -fsS -L --max-time 20 $(printf '%q' "$url")" 2>&1)
  else
    body=$(curl -fsS -L --max-time 20 "$url" 2>&1)
  fi
  if [ $? -ne 0 ]; then
    printf '%s\n' "$body" >&2
    return 1
  fi

  if ! printf '%s' "$body" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"'; then
    printf 'unexpected response: %s\n' "$body" >&2
    return 1
  fi

  check_passed "backend-health"
}

validate_backend_config_version() {
  require_env BACKEND_API_URL || return 1

  local url expected actual body
  # BACKEND_API_URL already includes /api, same join as validate_backend_health.
  url="${BACKEND_API_URL%/}/config"
  expected=$(expected_version) || return 1

  if is_local_url "$url" && [ -n "${SSH_TARGET:-}" ]; then
    body=$(ssh_remote "curl -fsS -L --max-time 20 $(printf '%q' "$url")" 2>&1)
  else
    body=$(curl -fsS -L --max-time 20 "$url" 2>&1)
  fi
  if [ $? -ne 0 ]; then
    printf '%s\n' "$body" >&2
    return 1
  fi

  actual=$(printf '%s' "$body" | extract_version_json)
  if [ -z "$actual" ]; then
    record_failure "backend-config-version" "missing version field"
    return 1
  fi

  if [ "$actual" != "$expected" ]; then
    record_failure "backend-config-version" "expected $expected, got $actual"
    return 1
  fi

  check_passed "backend-config-version"
}

# The Sync service owns /sync/* -- Google's OAuth redirect (/sync/google) and
# the push webhook (/sync/notifications/google). Those paths are reverse-proxied
# by a Caddyfile that lives on the host and NOT in this repo, so an edit for an
# unrelated reason can silently route them to the web app instead. That happened
# on 2026-08-14 and went unnoticed for nine days: Google got 200 OK with the
# SPA's HTML for every push, treated each as delivered, and never retried, so
# real-time sync was dead fleet-wide and no user could connect a calendar.
#
# Both failure modes are invisible to every other check here -- the containers
# are healthy and the API answers -- which is exactly why this one exists.
#
# The web app answers any path with 200 and text/html. Sync rejects a
# notification carrying none of Google's headers with 400. So an html
# content-type, or any status other than 400, means the route is misdirected.
validate_sync_webhook_route() {
  require_env FRONTEND_URL || return 1

  local base probe method url out status ctype
  base="${FRONTEND_URL%/}"

  # Each probe is "METHOD URL": the webhook is a POST route and the OAuth
  # callback a GET one, and hitting either with the wrong verb makes Express
  # answer its own html 404, which looks exactly like the misroute we are
  # testing for.
  for probe in \
    "POST $base/sync/notifications/google" \
    "GET $base/sync/google"; do
    method=${probe%% *}
    url=${probe#* }

    if is_local_url "$url" && [ -n "${SSH_TARGET:-}" ]; then
      out=$(ssh_remote "curl -sS -X $method --max-time 20 -o /dev/null -w '%{http_code} %{content_type}' $(printf '%q' "$url")" 2>&1)
    else
      out=$(curl -sS -X "$method" --max-time 20 -o /dev/null -w '%{http_code} %{content_type}' "$url" 2>&1)
    fi
    if [ $? -ne 0 ]; then
      printf 'curl failed for %s: %s\n' "$url" "$out" >&2
      return 1
    fi

    status=${out%% *}
    ctype=${out#* }

    case "$ctype" in
      text/html*)
        printf 'the web app is answering %s (content-type %s): /sync/* is not proxied to the Sync service. Check the host Caddyfile for a `handle /sync/*` block.\n' "$url" "$ctype" >&2
        return 1
        ;;
    esac

    case "$url" in
      */sync/notifications/google)
        if [ "$status" != "400" ]; then
          printf 'expected 400 from Sync at %s for a notification with no Google headers, got %s (content-type %s)\n' "$url" "$status" "$ctype" >&2
          return 1
        fi
        ;;
    esac
  done
}

setup_ssh() {
  require_env SSH_HOST || return 1
  require_env SSH_USER || return 1

  SSH_BIN=${SSH_BIN:-ssh}
  SSH_KEY_PATH=${SSH_KEY_PATH:-}
  SSH_TARGET="${SSH_USER}@${SSH_HOST}"
  SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=15)
  if [ -n "$SSH_KEY_PATH" ]; then
    SSH_OPTS+=(-i "$SSH_KEY_PATH")
  fi
}

ssh_remote() {
  "$SSH_BIN" "${SSH_OPTS[@]}" "$SSH_TARGET" "$@"
}

remote_compose_prefix() {
  if [ "${PROFILE:-}" = "selfhosted" ]; then
    printf 'cd ~/compass && COMPOSE_PROFILES=selfhosted,sync docker compose --project-name compass -f compose.yaml'
  else
    printf 'cd ~/compass && COMPOSE_PROFILES=sync docker compose --project-name compass -f compose.yaml'
  fi
}

remote_check_stack() {
  local expected_services=("web" "backend" "sync")
  local version=${RELEASE_TAG:-${TAG:-}}
  version=${version#v}

  if [ "${PROFILE:-}" = "selfhosted" ]; then
    expected_services+=("mongo" "supertokens" "supertokens-db")
  fi

  local prefix services
  prefix=$(remote_compose_prefix)
  services=$(printf '%s ' "${expected_services[@]}")

  ssh_remote "bash -se" <<REMOTE
set -euo pipefail
prefix="$prefix"
services="$services"
version="$version"
ps_output=\$(eval "\$prefix ps --format '{{.Service}} {{.State}} {{.Health}} {{.Image}}'")
printf '%s\n' "\$ps_output"

for service in \$services; do
  line=\$(printf '%s\n' "\$ps_output" | awk -v service="\$service" '\$1 == service { print; found=1 } END { exit found ? 0 : 1 }')
  printf '%s\n' "\$line" | grep -Eq " running |^\${service} running " || {
    printf 'service %s is not running: %s\n' "\$service" "\$line" >&2
    exit 1
  }
  if printf '%s\n' "\$line" | grep -Eq ' unhealthy| starting| exited| dead'; then
    printf 'service %s is not healthy/running: %s\n' "\$service" "\$line" >&2
    exit 1
  fi
done

for service in web backend sync; do
  line=\$(printf '%s\n' "\$ps_output" | awk -v service="\$service" '\$1 == service { print }')
  # web uses an environment-prefixed tag (e.g. staging-selfhosted-0.5.25); backend uses :0.5.25.
  # Check that the version string appears anywhere in the image tag for both.
  printf '%s\n' "\$line" | grep -F "$version" >/dev/null || {
    printf 'service %s does not use image tag %s: %s\n' "\$service" "\$version" "\$line" >&2
    exit 1
  }
done
REMOTE
}

remote_check_logs() {
  local prefix
  prefix=$(remote_compose_prefix)

  ssh_remote "bash -se" <<REMOTE
set -euo pipefail
prefix="$prefix"
logs=\$(eval "\$prefix logs --tail=200 --since=15m --no-color")
printf '%s\n' "\$logs" | tail -n 80
if printf '%s\n' "\$logs" | grep -Eiq 'fatal|panic|uncaught|unhandled|ECONNREFUSED|Database connectivity check failed|failed to start|startup failure'; then
  printf '%s\n' "\$logs" | grep -Ein 'fatal|panic|uncaught|unhandled|ECONNREFUSED|Database connectivity check failed|failed to start|startup failure' | tail -n 20 >&2
  exit 1
fi
REMOTE
}

remote_check_volumes() {
  local volumes=("compass_compass_backend_logs")

  if [ "${PROFILE:-}" = "selfhosted" ]; then
    volumes+=(
      "compass_compass_mongo_data"
      "compass_compass_mongo_configdb"
      "compass_compass_supertokens_postgres_data"
    )
  fi

  local quoted=()
  local volume
  for volume in "${volumes[@]}"; do
    quoted+=("$(printf '%q' "$volume")")
  done

  ssh_remote "bash -se" <<REMOTE
set -euo pipefail
for volume in ${quoted[*]}; do
  docker volume inspect "\$volume" >/dev/null
done
REMOTE
}

remote_check_cloud_mongo() {
  require_env MONGO_URI || return 1

  ssh_remote "MONGO_URI=$(printf '%q' "$MONGO_URI") bash -se" <<'REMOTE'
set -euo pipefail
cd ~/compass
if command -v mongosh >/dev/null 2>&1; then
  mongo_cmd="mongosh"
else
  mongo_cmd="docker run --rm mongo:8 mongosh"
fi
$mongo_cmd "$MONGO_URI" --quiet --eval '
  const ping = db.adminCommand({ ping: 1 });
  if (ping.ok !== 1) quit(1);
  const databases = db.adminCommand({ listDatabases: 1 }).databases
    .map(({ name }) => name)
    .filter((name) => !["admin", "config", "local"].includes(name));
  let total = 0;
  for (const name of databases) {
    const compassDb = db.getSiblingDB(name);
    const users = compassDb.user.countDocuments({});
    const events = compassDb.event.countDocuments({});
    if (users + events > 0) printjson({ database: name, users, events });
    total += users + events;
  }
  if (total < 1) quit(2);
'
REMOTE
}

remote_check_selfhosted_data() {
  local mongo_password=${MONGO_PASSWORD:-}
  local postgres_password=${SUPERTOKENS_POSTGRES_PASSWORD:-}

  ssh_remote "bash -se" <<REMOTE
set -euo pipefail
cd ~/compass
export COMPOSE_PROFILES=selfhosted

# Verify MongoDB is reachable and the replica set is healthy.
docker compose --project-name compass -f compose.yaml exec -T mongo mongosh --quiet \
  --username compass \
  --password $(printf '%q' "$mongo_password") \
  --authenticationDatabase admin \
  --eval '
    const ping = db.adminCommand({ ping: 1 });
    if (ping.ok !== 1) quit(1);
    const databases = db.adminCommand({ listDatabases: 1 }).databases
      .map(({ name }) => name)
      .filter((name) => !["admin", "config", "local"].includes(name));
    let total = 0;
    for (const name of databases) {
      const compassDb = db.getSiblingDB(name);
      const users = compassDb.user.countDocuments({});
      const events = compassDb.event.countDocuments({});
      if (users + events > 0) printjson({ database: name, users, events });
      total += users + events;
    }
    if (total < 1) print("warning: no user/event data found (expected on a fresh deployment)");
  '

# Verify Postgres (SuperTokens) is reachable.
docker compose --project-name compass -f compose.yaml exec -T supertokens-db pg_isready -U supertokens -d supertokens
docker compose --project-name compass -f compose.yaml exec -T -e PGPASSWORD=$(printf '%q' "$postgres_password") supertokens-db \
  psql -U supertokens -d supertokens -c 'select 1' >/dev/null
REMOTE
}

run_all_checks() {
  ENVIRONMENT=${ENVIRONMENT:-${INPUT_ENVIRONMENT:-}}
  PROFILE=${PROFILE:-${INPUT_PROFILE:-}}
  RELEASE_TAG=${RELEASE_TAG:-${TAG:-${INPUT_TAG:-}}}

  require_env ENVIRONMENT || exit 1
  require_env PROFILE || exit 1
  require_env RELEASE_TAG || exit 1
  setup_ssh || exit 1

  run_check "ssh-connectivity" ssh_remote "test -d ~/compass && test -x ~/compass/compass && test -f ~/compass/compose.yaml"
  if [ -z "${FRONTEND_URL:-}" ]; then
    record_failure "frontend-url" "missing FRONTEND_URL"
  else
    SUPPRESS_FRONTEND_FINISH=1 validate_frontend >/tmp/compass-frontend-check.log 2>&1 || true
    SUPPRESS_FRONTEND_FINISH=1 validate_frontend_version >/tmp/compass-frontend-version-check.log 2>&1 || true
  fi
  run_check "backend-health" validate_backend_health
  run_check "backend-config-version" validate_backend_config_version
  run_check "sync-webhook-route" validate_sync_webhook_route
  run_check "compass-status" ssh_remote "cd ~/compass && ./compass status"
  run_check "compose-services" remote_check_stack
  run_check "compose-logs-readable" remote_check_logs
  run_check "docker-volumes" remote_check_volumes

  case "$PROFILE" in
    cloud)
      run_check "mongo-cloud-data" remote_check_cloud_mongo
      ;;
    selfhosted)
      run_check "selfhosted-data-services" remote_check_selfhosted_data
      ;;
    *)
      record_failure "profile" "unsupported profile: $PROFILE"
      ;;
  esac

  finish
}

main() {
  case "${1:-run}" in
    run)
      run_all_checks
      ;;
    validate-frontend)
      validate_frontend
      ;;
    validate-frontend-version)
      validate_frontend_version
      ;;
    *)
      printf 'usage: %s [run|validate-frontend|validate-frontend-version]\n' "$0" >&2
      exit 2
      ;;
  esac
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
