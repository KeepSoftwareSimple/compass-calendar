#!/bin/sh

COMPASS_HOME=${COMPASS_HOME:-$HOME/compass}
COMPASS_VERSION=${COMPASS_VERSION:-latest}
COMPASS_RAW_URL=https://raw.githubusercontent.com/SwitchbackTech/compass
# 'latest' is a Docker Hub tag, not a git ref. Map it to 'main' for raw file downloads.
case $COMPASS_VERSION in
  latest) COMPASS_GIT_REF=main ;;
  *)      COMPASS_GIT_REF=$COMPASS_VERSION ;;
esac

CONFIG_FILE=$COMPASS_HOME/compass.yaml
MARKER_FILE=$COMPASS_HOME/.compass-self-host
HELPER_FILE=$COMPASS_HOME/compass
CONFIG_HELPER_FILE=$COMPASS_HOME/config.sh
COMPOSE_FILE=$COMPASS_HOME/compose.yaml
COMPOSE_SELFHOSTED_FILE=$COMPASS_HOME/compose.selfhosted.yaml

PROJECT_NAME=$(basename "$COMPASS_HOME")
WEB_PORT_VALUE=9080
PORT_VALUE=3000
APP_URL=http://localhost:9080
HEALTH_URL=http://localhost:3000/api/health
IS_REFRESH=0
TMP_ENV=
INSTALL_COMPLETE=0
FRESH_INSTALL_CREATED=0
STACK_TOUCHED=0

info() {
  printf '%s\n' "$*"
}

fail() {
  printf 'Compass installer: %s\n' "$*" >&2
  exit 1
}

cleanup() {
  if [ -n "$TMP_ENV" ] && [ -f "$TMP_ENV" ]; then
    rm -f "$TMP_ENV"
  fi

  if [ "$INSTALL_COMPLETE" -eq 0 ] && [ "$STACK_TOUCHED" -eq 1 ] && [ "$IS_REFRESH" -eq 0 ]; then
    compose_base down >/dev/null 2>&1 || true
    printf '%s\n' "Compass installer: Stopped failed install containers." >&2
  fi

  if [ "$INSTALL_COMPLETE" -eq 0 ] && [ "$FRESH_INSTALL_CREATED" -eq 1 ] && [ "$STACK_TOUCHED" -eq 0 ]; then
    rm -rf "$COMPASS_HOME"
    printf '%s\n' "Compass installer: Removed incomplete install files." >&2
  fi

  if [ "$INSTALL_COMPLETE" -eq 0 ] && [ "$FRESH_INSTALL_CREATED" -eq 1 ] && [ "$STACK_TOUCHED" -eq 1 ]; then
    printf '%s\n' "Compass installer: Left install files in place for retry and log inspection. Docker volumes were not deleted." >&2
  fi
}

interrupt() {
  trap - EXIT
  cleanup
  printf '%s\n' "Compass installer: Interrupted; cleaned up temporary files." >&2
  exit 1
}

trap cleanup EXIT
trap interrupt HUP INT TERM

is_interactive() {
  [ -t 0 ] && [ -t 1 ]
}

confirm_refresh() {
  info "Compass is already installed at $COMPASS_HOME."
  printf '%s' "Pull the latest images and restart Compass now? [y/N] "
  read answer || answer=

  case $answer in
    y | Y | yes | YES)
      return 0
      ;;
    *)
      info "Leaving the existing Compass install unchanged."
      exit 0
      ;;
  esac
}

check_missing_config_with_existing_volumes() {
  [ ! -f "$CONFIG_FILE" ] || return

  existing_volumes=
  delete_command="docker volume rm"
  for volume_name in \
    "${PROJECT_NAME}_compass_mongo_data" \
    "${PROJECT_NAME}_compass_supertokens_postgres_data"
  do
    if docker volume inspect "$volume_name" >/dev/null 2>&1; then
      existing_volumes="${existing_volumes}
  $volume_name"
      delete_command="$delete_command $volume_name"
    fi
  done

  [ -n "$existing_volumes" ] || return

  cat >&2 <<EOF
Compass installer: I found existing Compass Docker data, but $CONFIG_FILE is missing.

This usually means Compass was installed before, then the install folder or compass.yaml file was removed.
The installer stopped before creating a new compass.yaml because new database passwords could lock you out of that data.

Existing Docker volumes for "$PROJECT_NAME":$existing_volumes

Next steps:
  - Keep old data: restore $CONFIG_FILE, then rerun the installer.
  - Start fresh with a different name: set COMPASS_HOME to a new directory (the directory name becomes the project name).
    Example: curl -fsSL https://raw.githubusercontent.com/SwitchbackTech/compass/main/self-host/install.sh | env COMPASS_HOME="$HOME/compass-new" sh
  - Start over after confirming you do not need the old data:
    $delete_command
EOF
  exit 1
}

check_install_dir() {
  if [ -e "$COMPASS_HOME" ] && [ ! -d "$COMPASS_HOME" ]; then
    fail "$COMPASS_HOME exists but is not a directory. Choose another COMPASS_HOME."
  fi

  if [ -d "$COMPASS_HOME" ]; then
    if [ ! -f "$MARKER_FILE" ]; then
      fail "$COMPASS_HOME already exists but is not a Compass install. Choose another COMPASS_HOME or move that folder aside."
    fi

    if ! is_interactive; then
      fail "Compass is already installed at $COMPASS_HOME. Use $HELPER_FILE update, or rerun this installer from an interactive shell to refresh and restart."
    fi

    IS_REFRESH=1
    confirm_refresh
    return
  fi
}

prepare_install_dir() {
  if [ "$IS_REFRESH" -eq 0 ] && [ ! -d "$COMPASS_HOME" ]; then
    FRESH_INSTALL_CREATED=1
  fi

  mkdir -p "$COMPASS_HOME" || fail "Could not create $COMPASS_HOME."
}

require_command() {
  command_name=$1
  message=$2

  command -v "$command_name" >/dev/null 2>&1 || fail "$message"
}

require_prerequisites() {
  require_command curl "curl is required. Install curl, then rerun this installer."
  require_command docker "Docker is required. Install Docker Desktop or Docker Engine, start it, then rerun this installer."

  docker info >/dev/null 2>&1 || fail "Docker is not running. Start Docker, then rerun this installer."
  docker compose version >/dev/null 2>&1 || fail "Docker Compose is required. Install Docker Compose, then rerun this installer."
}

port_is_busy() {
  port=$1

  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi

  if command -v nc >/dev/null 2>&1; then
    nc -z 127.0.0.1 "$port" >/dev/null 2>&1
    return $?
  fi

  curl -sS --max-time 1 -o /dev/null "http://127.0.0.1:$port/" >/dev/null 2>&1
}

check_required_ports() {
  for port in "$WEB_PORT_VALUE" "$PORT_VALUE"; do
    if port_is_busy "$port"; then
      fail "Port $port is already in use. Stop the process using it, then rerun this installer."
    fi
  done
}

validate_port_value() {
  name=$1
  value=$2

  case $value in
    '' | *[!0123456789]*)
      fail "$name must be a number from 1 to 65535. Found: $value"
      ;;
  esac

  if [ "$value" -lt 1 ] || [ "$value" -gt 65535 ]; then
    fail "$name must be a number from 1 to 65535. Found: $value"
  fi
}

load_runtime_config() {
  web_port=$(strip_quotes "$(read_config_value web.port)")
  backend_port=$(strip_quotes "$(read_config_value backend.port)")

  WEB_PORT_VALUE=${web_port:-9080}
  PORT_VALUE=${backend_port:-3000}
  validate_port_value WEB_PORT "$WEB_PORT_VALUE"
  validate_port_value PORT "$PORT_VALUE"
  frontend_url=$(strip_quotes "$(read_config_value web.url)")

  APP_URL=${frontend_url:-http://localhost:$WEB_PORT_VALUE}
  HEALTH_URL=${COMPASS_HEALTH_URL:-http://localhost:$PORT_VALUE/api/health}
}

random_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
    return
  fi

  if [ -r /dev/urandom ]; then
    dd if=/dev/urandom bs=32 count=1 2>/dev/null | od -An -tx1 | tr -d ' \n'
    printf '\n'
    return
  fi

  return 1
}

generate_secret() {
  label=$1

  secret=$(random_hex) || fail "Could not generate $label. Install openssl or provide /dev/urandom."

  if [ "${#secret}" -ne 64 ]; then
    fail "Generated $label was invalid. Expected a 64-character hex string."
  fi

  case $secret in
    *[!0123456789abcdefABCDEF]*)
      fail "Generated $label was invalid. Expected a 64-character hex string."
      ;;
  esac

  printf '%s\n' "$secret"
}

generate_base64_key() {
  label=$1

  if command -v openssl >/dev/null 2>&1; then
    secret=$(openssl rand -base64 32 | tr -d '\n')
  elif [ -r /dev/urandom ] && command -v base64 >/dev/null 2>&1; then
    secret=$(dd if=/dev/urandom bs=32 count=1 2>/dev/null | base64 | tr -d '\n')
  else
    fail "Could not generate $label. Install openssl."
  fi

  if [ -z "$secret" ]; then
    fail "Could not generate $label. Install openssl."
  fi

  printf '%s\n' "$secret"
}

validate_existing_secret() {
  key=$1
  placeholder=$2
  value=$(strip_quotes "$(read_config_value "$key")")

  if [ -z "$value" ]; then
    fail "$CONFIG_FILE has an empty required secret: $key. Set a non-placeholder value, then rerun this installer."
  fi

  if [ "$value" = "$placeholder" ]; then
    fail "$CONFIG_FILE still has the template placeholder for $key. Set a real value, then rerun this installer."
  fi
}

validate_existing_mongo_uri() {
  mongo_uri=$(strip_quotes "$(read_config_value mongo.uri)")

  if [ -z "$mongo_uri" ]; then
    fail "$CONFIG_FILE has an empty required MongoDB connection string: mongo.uri. Set a non-placeholder value, then rerun this installer."
  fi

  case $mongo_uri in
    *replace-with-generated-mongo-password* | *YOUR_ADMIN_PW* | *change-me-mongo-password-32chars*)
      fail "$CONFIG_FILE has a placeholder password in mongo.uri. Set a real value, then rerun this installer."
      ;;
  esac
}

ensure_existing_generated_secret() {
  key=$1
  label=$2
  value=$(strip_quotes "$(read_config_value "$key")")

  if [ -n "$value" ]; then
    return
  fi

  fail "$CONFIG_FILE is missing required generated value $key. Add it from the self-host example, then rerun this installer."
}

ensure_existing_local_mongo_uri_replica_set() {
  mongo_uri=$(strip_quotes "$(read_config_value mongo.uri)")

  case $mongo_uri in
    *mongo:27017*) ;;
    *) return ;;
  esac

  case $mongo_uri in
    *replicaSet=*) return ;;
  esac

  separator="?"
  case $mongo_uri in
    *\?*) separator="&" ;;
  esac

  fail "$CONFIG_FILE mongo.uri must include MongoDB replica set settings. Add ${separator}replicaSet=rs0, then rerun this installer."
}

validate_existing_env_secrets() {
  [ -f "$CONFIG_FILE" ] || return

  ensure_existing_generated_secret mongo.replicaSetKey "MongoDB replica set key"
  ensure_existing_local_mongo_uri_replica_set

  validate_existing_secret mongo.password change-me-mongo-password-32chars
  validate_existing_secret mongo.replicaSetKey change-me-mongo-replica-set-key-32chars
  validate_existing_secret supertokens.postgres.password change-me-supertokens-postgres-pass-32
  validate_existing_secret supertokens.key change-me-supertokens-key-32chars
  validate_existing_secret backend.compassToken change-me-compass-sync-token-32chars
  validate_existing_mongo_uri
}

write_config_if_missing() {
  if [ -f "$CONFIG_FILE" ]; then
    info "Keeping existing config file at $CONFIG_FILE."
    validate_existing_env_secrets
    return
  fi

  mongo_password=$(generate_secret "MongoDB password") || exit 1
  mongo_replica_set_key=$(generate_secret "MongoDB replica set key") || exit 1
  supertokens_postgres_password=$(generate_secret "SuperTokens Postgres password") || exit 1
  supertokens_key=$(generate_secret "SuperTokens API key") || exit 1
  compass_sync_token=$(generate_secret "Compass sync token") || exit 1
  sync_internal_auth_token=$(generate_secret "Sync internal auth token") || exit 1
  credential_encryption_key=$(generate_base64_key "Sync credential encryption key") || exit 1

  umask 077
  TMP_ENV=$COMPASS_HOME/compass.yaml.$$
  cat > "$TMP_ENV" <<EOF
# See https://docs.compasscalendar.com/docs/self-hosting/config

runtime:
  version: $COMPASS_VERSION
  nodeEnv: production
  logLevel: info
  timezone: Etc/UTC

web:
  port: 9080
  url: http://localhost:$WEB_PORT_VALUE

backend:
  port: 3000
  apiUrl: http://localhost:$PORT_VALUE/api
  originsAllowed:
    - http://localhost:$WEB_PORT_VALUE
  compassToken: $compass_sync_token

mongo:
  username: compass
  password: $mongo_password
  replicaSetKey: $mongo_replica_set_key
  uri: mongodb://compass:$mongo_password@mongo:27017/prod_calendar?authSource=admin&replicaSet=rs0

supertokens:
  uri: http://supertokens:3567
  key: $supertokens_key
  postgres:
    user: supertokens
    password: $supertokens_postgres_password
    database: supertokens

# google:
#   clientId: REPLACE_WITH_GOOGLE_CLIENT_ID # e.g. your-id.apps.googleusercontent.com
#   clientSecret: REPLACE_WITH_GOOGLE_CLIENT_SECRET

# microsoft:
#   clientId: REPLACE_WITH_MICROSOFT_CLIENT_ID
#   clientSecret: REPLACE_WITH_MICROSOFT_CLIENT_SECRET

# apple:
#   signIn:
#     servicesId: REPLACE_WITH_APPLE_SERVICES_ID
#     teamId: REPLACE_WITH_APPLE_TEAM_ID
#     keyId: REPLACE_WITH_APPLE_KEY_ID
#     privateKey: REPLACE_WITH_APPLE_PRIVATE_KEY

# Compass Sync service — self-host runs the same architecture as Compass
# Cloud. Uses the SAME bundled mongo as \`mongo:\` above, isolated to its own
# compass_sync database (no separate database user exists on the bundled
# image, so this reuses the root credentials against a different database
# name). callbackBaseUrl defaults to localhost, which works for the OAuth
# redirect but cannot receive Google push notifications — set it to your
# public URL (and rerun with COMPASS_HOME set, or edit $CONFIG_FILE directly)
# once you have a domain.
sync:
  port: 3010
  mongoUri: mongodb://compass:$mongo_password@mongo:27017/compass_sync?authSource=admin&replicaSet=rs0
  internalAuthToken: $sync_internal_auth_token
  callbackBaseUrl: http://localhost:3010
  serviceUrl: http://sync:3010
  cloudMutationMode: enabled
  execution: active
  credentialEncryptionKey: "$credential_encryption_key"
EOF

  chmod 600 "$TMP_ENV" || fail "Could not secure temporary env file."
  mv "$TMP_ENV" "$CONFIG_FILE" || fail "Could not write $CONFIG_FILE."
  TMP_ENV=
  info "Created $CONFIG_FILE with local defaults and generated secrets."
}

download_compose_file() {
  tmp_compose=$COMPASS_HOME/compose.yaml.$$
  tmp_selfhosted=$COMPASS_HOME/compose.selfhosted.yaml.$$
  info "Downloading compose.yaml for Compass ${COMPASS_VERSION}."
  curl -fsSL "${COMPASS_RAW_URL}/${COMPASS_GIT_REF}/self-host/compose.yaml" -o "$tmp_compose" \
    || fail "Could not download compose.yaml for version ${COMPASS_VERSION}. Check that the version exists."
  curl -fsSL "${COMPASS_RAW_URL}/${COMPASS_GIT_REF}/self-host/compose.selfhosted.yaml" -o "$tmp_selfhosted" \
    || fail "Could not download compose.selfhosted.yaml for version ${COMPASS_VERSION}. Check that the version exists."

  if [ -f "$COMPOSE_FILE" ]; then
    cp "$COMPOSE_FILE" "${COMPASS_HOME}/.compose.yaml.bak" || true
  fi

  mv "$tmp_compose" "$COMPOSE_FILE" || fail "Could not install compose.yaml."
  mv "$tmp_selfhosted" "$COMPASS_HOME/compose.selfhosted.yaml" \
    || fail "Could not install compose.selfhosted.yaml."
}

download_helper() {
  info "Downloading compass helper for Compass ${COMPASS_VERSION}."
  tmp_helper=$COMPASS_HOME/compass.$$
  curl -fsSL "${COMPASS_RAW_URL}/${COMPASS_GIT_REF}/self-host/compass" -o "$tmp_helper" \
    || fail "Could not download compass helper for version ${COMPASS_VERSION}."
  chmod +x "$tmp_helper" || fail "Could not make $tmp_helper executable."
  mv "$tmp_helper" "$HELPER_FILE" || fail "Could not install compass helper."
}

download_config_helper() {
  tmp_config_helper=$COMPASS_HOME/config.sh.$$
  curl -fsSL "${COMPASS_RAW_URL}/${COMPASS_GIT_REF}/self-host/config.sh" -o "$tmp_config_helper" \
    || fail "Could not download config helper for version ${COMPASS_VERSION}."
  mv "$tmp_config_helper" "$CONFIG_HELPER_FILE" \
    || fail "Could not install config helper."
  . "$CONFIG_HELPER_FILE"
}

write_marker() {
  cat > "$MARKER_FILE" <<EOF
Compass self-host install
COMPASS_HOME=$COMPASS_HOME
COMPASS_VERSION=$COMPASS_VERSION
EOF
  [ $? -eq 0 ] || fail "Could not write marker file: $MARKER_FILE."
}

set_compose_env() {
  [ -f "$CONFIG_FILE" ] || fail "Missing config file: $CONFIG_FILE."
  export COMPASS_CONFIG_FILE="$CONFIG_FILE"
  export COMPASS_CONFIG_REVISION="$(config_file_revision)"
  export COMPOSE_PROFILES="${COMPOSE_PROFILES-$(default_profiles)}"
  export COMPASS_VERSION="$(strip_quotes "$(read_config_value runtime.version)")"
  export WEB_PORT="$(strip_quotes "$(read_config_value web.port)")"
  export PORT="$(strip_quotes "$(read_config_value backend.port)")"
  export MONGO_INITDB_ROOT_USERNAME="$(strip_quotes "$(read_config_value mongo.username)")"
  export MONGO_INITDB_ROOT_PASSWORD="$(strip_quotes "$(read_config_value mongo.password)")"
  export MONGO_REPLICA_SET_KEY="$(strip_quotes "$(read_config_value mongo.replicaSetKey)")"
  export SUPERTOKENS_KEY="$(strip_quotes "$(read_config_value supertokens.key)")"
  export SUPERTOKENS_POSTGRES_USER="$(strip_quotes "$(read_config_value supertokens.postgres.user)")"
  export SUPERTOKENS_POSTGRES_PASSWORD="$(strip_quotes "$(read_config_value supertokens.postgres.password)")"
  export SUPERTOKENS_POSTGRES_DB="$(strip_quotes "$(read_config_value supertokens.postgres.database)")"
}

compose_base() {
  set_compose_env
  case ",${COMPOSE_PROFILES}," in
    *,selfhosted,*)
      if [ -f "$COMPOSE_SELFHOSTED_FILE" ]; then
        docker compose --project-name "$PROJECT_NAME" \
          -f "$COMPOSE_FILE" -f "$COMPOSE_SELFHOSTED_FILE" "$@"
        return
      fi
      ;;
  esac
  docker compose --project-name "$PROJECT_NAME" -f "$COMPOSE_FILE" "$@"
}

start_stack() {
  info "Starting Compass. Pulling images on first run. This may take a few minutes."
  STACK_TOUCHED=1
  compose_base up -d || fail "Docker Compose failed. Compass was not started."
}

health_check() {
  curl --max-time 5 -fsS "$HEALTH_URL" >/dev/null 2>&1
}

wait_for_health() {
  tries=60

  while [ "$tries" -gt 0 ]; do
    if health_check; then
      return 0
    fi

    tries=$((tries - 1))
    sleep 2
  done

  return 1
}

print_recent_logs() {
  printf '%s\n' "Recent Compass logs:" >&2
  compose_base logs --tail 80 >&2 || true
}

open_browser() {
  if command -v open >/dev/null 2>&1; then
    open "$APP_URL" >/dev/null 2>&1 || true
    return
  fi

  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$APP_URL" >/dev/null 2>&1 || true
    return
  fi

  if command -v cmd.exe >/dev/null 2>&1; then
    cmd.exe /c start "" "$APP_URL" >/dev/null 2>&1 || true
  fi
}

print_google_note() {
  google_client_id=$(strip_quotes "$(read_config_value google.clientId)")
  google_client_secret=$(strip_quotes "$(read_config_value google.clientSecret)")

  cat <<EOF
Google setup:
EOF

  if [ -z "$google_client_id" ] || [ -z "$google_client_secret" ]; then
    cat <<EOF
  Google auth and Google Calendar sync are not configured.
  To add your own OAuth credentials, edit:
    $CONFIG_FILE
  Then rebuild the web image (backend.apiUrl and google.clientId are baked in at build time):
    $HELPER_FILE rebuild
  See https://docs.compasscalendar.com/docs/self-hosting/google-calendar
EOF
  else
    cat <<EOF
  Custom Google OAuth credentials are present in:
    $CONFIG_FILE
  If you change google.clientId or backend.apiUrl, rebuild the web image to apply them:
    $HELPER_FILE rebuild
EOF
  fi
}

print_success() {
  cat <<EOF

Compass is running locally.

URL:
  $APP_URL

EOF

  print_google_note

  cat <<EOF

Useful commands:
  cd "$COMPASS_HOME"
  ./compass status
  ./compass logs
  ./compass restart
  ./compass rebuild
  ./compass update
  ./compass stop

Data volumes:
  ${PROJECT_NAME}_compass_mongo_data
  ${PROJECT_NAME}_compass_supertokens_postgres_data

The installer never deletes Docker volumes or user data.
EOF
}

# ── Main ──────────────────────────────────────────────────────────────────────

check_install_dir
require_prerequisites
check_missing_config_with_existing_volumes
prepare_install_dir
download_config_helper
load_runtime_config

if [ "$IS_REFRESH" -eq 0 ]; then
  check_required_ports
else
  info "Refreshing existing install; Docker Compose will reuse configured ports $WEB_PORT_VALUE and $PORT_VALUE."
fi

write_config_if_missing
load_runtime_config
download_compose_file
download_helper
write_marker
start_stack

if wait_for_health; then
  INSTALL_COMPLETE=1
  open_browser
  print_success
else
  print_recent_logs
  fail "Compass started, but $HEALTH_URL did not become healthy within 2 minutes."
fi
