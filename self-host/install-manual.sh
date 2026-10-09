#!/bin/bash
# ╔═══════════════════════════════════════════════════════════════════════════╗
# ║                    Compass Self-Host Manual Installer                     ║
# ╚═══════════════════════════════════════════════════════════════════════════╝
#
# This script is a documented, step-by-step version of install.sh.
# It is NOT meant to be piped to a shell (like `curl ... | sh`).
#
# How to use:
#   1. Read through each section to understand what it does
#   2. Copy and paste commands into your terminal one section at a time
#   3. Verify each step succeeds before moving to the next
#
# For the automated installer, run:
#   curl -fsSL https://raw.githubusercontent.com/SwitchbackTech/compass/main/self-host/install.sh | sh
#
# Requirements:
#   - Docker Desktop or Docker Engine (running)
#   - Docker Compose v2
#   - curl
#   - Ports 9080 and 3000 available
#
# ─────────────────────────────────────────────────────────────────────────────

# ── Section 1: Variables ──────────────────────────────────────────────────────
# These variables control where Compass is installed and which version to use.
# Review and modify these before running any commands.

# Where Compass will be installed. All config, compose files, and helpers go here.
COMPASS_HOME=${COMPASS_HOME:-$HOME/compass}

# Which version to install. "latest" uses the most recent stable release.
# Pin to a specific version (e.g., "v1.2.3") for reproducible installs.
COMPASS_VERSION=${COMPASS_VERSION:-latest}

# Base URL for downloading files from the Compass repository.
COMPASS_RAW_URL=https://raw.githubusercontent.com/SwitchbackTech/compass

# Map Docker Hub tags to git refs. "latest" on Docker Hub corresponds to "main" branch.
case $COMPASS_VERSION in
  latest) COMPASS_GIT_REF=main ;;
  *)      COMPASS_GIT_REF=$COMPASS_VERSION ;;
esac

# Derived paths for the files we'll create/download.
CONFIG_FILE=$COMPASS_HOME/compass.yaml      # Your configuration (secrets, ports, etc.)
MARKER_FILE=$COMPASS_HOME/.compass-self-host # Marks this as a Compass install directory
HELPER_FILE=$COMPASS_HOME/compass            # CLI helper script for day-to-day management
CONFIG_HELPER_FILE=$COMPASS_HOME/config.sh   # Shared config/profile parser
COMPOSE_FILE=$COMPASS_HOME/compose.yaml      # Docker Compose configuration
COMPOSE_SELFHOSTED_FILE=$COMPASS_HOME/compose.selfhosted.yaml

# The project name is derived from the install directory name.
# Docker Compose uses this to namespace containers and volumes.
PROJECT_NAME=$(basename "$COMPASS_HOME")

# Default ports. The web UI runs on WEB_PORT, the API on PORT.
WEB_PORT_VALUE=9080
PORT_VALUE=3000

# URLs for accessing Compass after installation.
APP_URL=http://localhost:$WEB_PORT_VALUE
HEALTH_URL=http://localhost:$PORT_VALUE/api/health

echo "Installation will use:"
echo "  COMPASS_HOME=$COMPASS_HOME"
echo "  COMPASS_VERSION=$COMPASS_VERSION"
echo "  Web UI: $APP_URL"
echo "  API: http://localhost:$PORT_VALUE"

# ── Section 2: Prerequisites ──────────────────────────────────────────────────
# Verify that all required tools are installed and running.
# These commands should all succeed silently (no output = good).

echo "Checking prerequisites..."

# curl is needed to download files from GitHub.
command -v curl >/dev/null 2>&1 || { echo "ERROR: curl is required. Install curl, then try again."; exit 1; }
echo "  ✓ curl is installed"

# Docker is required to run the containers.
command -v docker >/dev/null 2>&1 || { echo "ERROR: Docker is required. Install Docker Desktop or Docker Engine, then try again."; exit 1; }
echo "  ✓ docker is installed"

# Docker must be running (not just installed).
docker info >/dev/null 2>&1 || { echo "ERROR: Docker is not running. Start Docker, then try again."; exit 1; }
echo "  ✓ Docker is running"

# Docker Compose v2 is required (the "docker compose" subcommand, not docker-compose).
docker compose version >/dev/null 2>&1 || { echo "ERROR: Docker Compose v2 is required. Install it, then try again."; exit 1; }
echo "  ✓ Docker Compose is available"

echo "All prerequisites met."

# ── Section 3: Port Check ─────────────────────────────────────────────────────
# Compass needs two ports: one for the web UI (9080) and one for the API (3000).
# These commands check if something else is already using those ports.

echo "Checking if required ports are available..."

# Helper function to check if a port is in use.
# Returns 0 (success/true) if the port IS busy, 1 if it's free.
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
  # Fallback: try to connect with curl (least reliable).
  curl -sS --max-time 1 -o /dev/null "http://127.0.0.1:$port/" >/dev/null 2>&1
}

if port_is_busy "$WEB_PORT_VALUE"; then
  echo "ERROR: Port $WEB_PORT_VALUE is already in use."
  echo "Find what's using it: lsof -i :$WEB_PORT_VALUE"
  exit 1
fi
echo "  ✓ Port $WEB_PORT_VALUE is available (web UI)"

if port_is_busy "$PORT_VALUE"; then
  echo "ERROR: Port $PORT_VALUE is already in use."
  echo "Find what's using it: lsof -i :$PORT_VALUE"
  exit 1
fi
echo "  ✓ Port $PORT_VALUE is available (API)"

# ── Section 4: Create Directory ───────────────────────────────────────────────
# Create the installation directory if it doesn't exist.
# If it exists and contains a Compass install, we'll update it.

echo "Preparing installation directory..."

if [ -e "$COMPASS_HOME" ] && [ ! -d "$COMPASS_HOME" ]; then
  echo "ERROR: $COMPASS_HOME exists but is not a directory."
  echo "Choose a different COMPASS_HOME or remove the existing file."
  exit 1
fi

if [ -d "$COMPASS_HOME" ] && [ -f "$MARKER_FILE" ]; then
  echo "  Existing Compass install found at $COMPASS_HOME"
  echo "  This will update/refresh that installation."
elif [ -d "$COMPASS_HOME" ]; then
  echo "ERROR: $COMPASS_HOME exists but is not a Compass install."
  echo "Choose a different COMPASS_HOME or move that directory aside."
  exit 1
fi

mkdir -p "$COMPASS_HOME" || { echo "ERROR: Could not create $COMPASS_HOME"; exit 1; }
echo "  ✓ Directory ready: $COMPASS_HOME"

# ── Section 5: Generate Secrets ───────────────────────────────────────────────
# Compass needs several cryptographic secrets for security:
#   - MongoDB password: authenticates the app to the database
#   - MongoDB replica set key: authenticates replica set members to each other
#   - SuperTokens Postgres password: authenticates SuperTokens to its database
#   - SuperTokens API key: authenticates the backend to SuperTokens
#   - Compass sync token: authenticates sync requests between components
#   - Sync credential encryption key: encrypts Apple app-specific passwords at rest
#
# Hex secrets are 64 hexadecimal characters (32 bytes of entropy).
# The credential encryption key is 32 bytes encoded as base64.

echo "Generating cryptographic secrets..."

# Helper function to generate a 64-character hex string (32 bytes).
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
  echo "ERROR: Cannot generate secure random values. Install openssl."
  return 1
}

# Generate all required secrets.
MONGO_PASSWORD=$(random_hex) || exit 1
MONGO_REPLICA_SET_KEY=$(random_hex) || exit 1
SUPERTOKENS_POSTGRES_PASSWORD=$(random_hex) || exit 1
SUPERTOKENS_KEY=$(random_hex) || exit 1
COMPASS_SYNC_TOKEN=$(random_hex) || exit 1
SYNC_INTERNAL_AUTH_TOKEN=$(random_hex) || exit 1
CREDENTIAL_ENCRYPTION_KEY=$(openssl rand -base64 32 | tr -d '\n') || exit 1

echo "  ✓ Generated cryptographic secrets"

# ── Section 6: Create Config File ─────────────────────────────────────────────
# The compass.yaml file contains all configuration for your Compass instance.
# This includes ports, URLs, database credentials, and API keys.
#
# IMPORTANT: This file contains secrets. It will be created with mode 600
# (readable only by you). Do not commit it to version control.

echo "Creating configuration file..."

if [ -f "$CONFIG_FILE" ]; then
  echo "  Config file already exists at $CONFIG_FILE"
  echo "  Keeping existing configuration. Delete it manually if you want a fresh one."
else
  # Set restrictive permissions before writing secrets.
  umask 077

  cat > "$CONFIG_FILE" <<EOF
# Compass Self-Host Configuration
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
  compassToken: $COMPASS_SYNC_TOKEN

mongo:
  username: compass
  password: $MONGO_PASSWORD
  replicaSetKey: $MONGO_REPLICA_SET_KEY
  uri: mongodb://compass:$MONGO_PASSWORD@mongo:27017/prod_calendar?authSource=admin&replicaSet=rs0

supertokens:
  uri: http://supertokens:3567
  key: $SUPERTOKENS_KEY
  postgres:
    user: supertokens
    password: $SUPERTOKENS_POSTGRES_PASSWORD
    database: supertokens

# To enable Google Calendar sign-in and calendar sync, uncomment and fill in
# your OAuth credentials:
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
# Cloud. Uses the SAME bundled mongo as `mongo:` above, isolated to its own
# compass_sync database (no separate database user exists on the bundled
# image, so this reuses the root credentials against a different database
# name). callbackBaseUrl defaults to localhost, which works for the OAuth
# redirect but cannot receive Google push notifications — set it to your
# public URL once you have a domain.
sync:
  port: 3010
  mongoUri: mongodb://compass:$MONGO_PASSWORD@mongo:27017/compass_sync?authSource=admin&replicaSet=rs0
  internalAuthToken: $SYNC_INTERNAL_AUTH_TOKEN
  callbackBaseUrl: http://localhost:3010
  serviceUrl: http://sync:3010
  cloudMutationMode: enabled
  execution: active
  credentialEncryptionKey: "$CREDENTIAL_ENCRYPTION_KEY"
EOF

  chmod 600 "$CONFIG_FILE"
  echo "  ✓ Created $CONFIG_FILE with generated secrets"
fi

# ── Section 7: Download Files ─────────────────────────────────────────────────
# Download the Docker Compose configuration and the helper script from GitHub.
# These files define how Compass runs and provide convenient management commands.

echo "Downloading Compass files for version $COMPASS_VERSION..."

download_atomically() {
  url=$1
  destination=$2
  temporary_file="${destination}.$$"

  curl -fsSL "$url" -o "$temporary_file" || {
    rm -f "$temporary_file"
    return 1
  }
  mv "$temporary_file" "$destination"
}

# Download compose.yaml - defines all the Docker services (mongo, backend, web, etc.)
curl -fsSL "${COMPASS_RAW_URL}/${COMPASS_GIT_REF}/self-host/compose.yaml" -o "$COMPOSE_FILE" \
  || { echo "ERROR: Could not download compose.yaml"; exit 1; }
echo "  ✓ Downloaded compose.yaml"

# Selfhosted overlay hard-waits for healthy mongo before starting backend.
curl -fsSL "${COMPASS_RAW_URL}/${COMPASS_GIT_REF}/self-host/compose.selfhosted.yaml" \
  -o "$COMPASS_HOME/compose.selfhosted.yaml" \
  || { echo "ERROR: Could not download compose.selfhosted.yaml"; exit 1; }
echo "  ✓ Downloaded compose.selfhosted.yaml"

# Install the dependency before the helper that sources it. Atomic moves keep
# a failed refresh from replacing a working installation with a partial file.
download_atomically "${COMPASS_RAW_URL}/${COMPASS_GIT_REF}/self-host/config.sh" "$CONFIG_HELPER_FILE" \
  || { echo "ERROR: Could not download config helper"; exit 1; }
. "$CONFIG_HELPER_FILE"
echo "  ✓ Downloaded config helper"

# Download the compass helper script - provides commands like "compass logs", "compass restart"
download_atomically "${COMPASS_RAW_URL}/${COMPASS_GIT_REF}/self-host/compass" "$HELPER_FILE" \
  || { echo "ERROR: Could not download compass helper"; exit 1; }
chmod +x "$HELPER_FILE"
echo "  ✓ Downloaded compass helper script"

# ── Section 8: Write Marker File ──────────────────────────────────────────────
# The marker file identifies this directory as a Compass installation.
# It prevents accidentally installing over an unrelated directory
# and records metadata about the installation.

echo "Writing installation marker..."

cat > "$MARKER_FILE" <<EOF
Compass self-host install
COMPASS_HOME=$COMPASS_HOME
COMPASS_VERSION=$COMPASS_VERSION
EOF

echo "  ✓ Created marker file"

# ── Section 9: Set Environment ────────────────────────────────────────────────
# Docker Compose needs several environment variables to configure the containers.
# These are read from compass.yaml and exported to the environment.
#
# NOTE: These exports only affect the current shell session.
# The compass helper script handles this automatically for day-to-day use.

echo "Setting up environment for Docker Compose..."

# Export all variables needed by compose.yaml.
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

echo "  ✓ Environment variables exported"

compose_base() {
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

# ── Section 10: Start Stack ───────────────────────────────────────────────────
# Start all Compass services using Docker Compose.
# On first run, this will download container images (may take a few minutes).
#
# Services started:
#   - mongo: MongoDB database with replica set
#   - supertokens-postgres: PostgreSQL for SuperTokens auth
#   - supertokens: Authentication service
#   - backend: Compass API server
#   - web: Compass web UI

echo "Starting Compass..."
echo "  (First run will download images - this may take a few minutes)"

compose_base up -d \
  || { echo "ERROR: Docker Compose failed to start Compass"; exit 1; }

echo "  ✓ Compass containers started"

# ── Section 11: Verify Health ─────────────────────────────────────────────────
# Wait for the backend to become healthy before declaring success.
# The health endpoint confirms the API is running and connected to databases.

echo "Waiting for Compass to become healthy..."
echo "  Checking $HEALTH_URL"

tries=60
while [ "$tries" -gt 0 ]; do
  if curl --max-time 5 -fsS "$HEALTH_URL" >/dev/null 2>&1; then
    echo "  ✓ Compass is healthy!"
    break
  fi
  tries=$((tries - 1))
  printf "."
  sleep 2
done

if [ "$tries" -eq 0 ]; then
  echo ""
  echo "ERROR: Compass did not become healthy within 2 minutes."
  echo "Check the logs for errors:"
  echo "  docker compose --project-name $PROJECT_NAME -f $COMPOSE_FILE logs"
  exit 1
fi

# ── Section 12: Open Browser ──────────────────────────────────────────────────
# Optionally open Compass in your default browser.
# These commands are platform-specific and will fail silently if unavailable.

echo ""
echo "Opening Compass in your browser..."

# macOS
if command -v open >/dev/null 2>&1; then
  open "$APP_URL" >/dev/null 2>&1 || true
# Linux with X11
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$APP_URL" >/dev/null 2>&1 || true
# Windows (WSL)
elif command -v cmd.exe >/dev/null 2>&1; then
  cmd.exe /c start "" "$APP_URL" >/dev/null 2>&1 || true
else
  echo "  (Could not auto-open browser)"
fi

# ── Installation Complete! ────────────────────────────────────────────────────

cat <<EOF

════════════════════════════════════════════════════════════════════════════════
                         Compass is running!
════════════════════════════════════════════════════════════════════════════════

URL: $APP_URL

Configuration file:
  $CONFIG_FILE

Google Calendar sync:
  Not configured by default. To enable it, edit compass.yaml and add your
  Google OAuth credentials, then run: $HELPER_FILE rebuild
  See: https://docs.compasscalendar.com/docs/self-hosting/google-calendar

════════════════════════════════════════════════════════════════════════════════
EOF

# ── Appendix: Useful Commands ─────────────────────────────────────────────────
# These commands help you manage your Compass installation after setup.
# The compass helper script wraps most of these for convenience.

cat <<EOF

Useful commands (run from $COMPASS_HOME):

  ./compass status     # Show running containers
  ./compass logs       # View container logs
  ./compass logs -f    # Follow logs in real-time
  ./compass restart    # Restart all services
  ./compass stop       # Stop all services
  ./compass start      # Start all services
  ./compass update     # Pull latest images and restart
  ./compass rebuild    # Rebuild web image (after config changes)

Or use Docker Compose directly:

  cd "$COMPASS_HOME"
  export COMPASS_CONFIG_FILE="$CONFIG_FILE"
  export COMPOSE_PROFILES=selfhosted,sync
  docker compose --project-name "$PROJECT_NAME" -f compose.yaml logs
  docker compose --project-name "$PROJECT_NAME" -f compose.yaml down
  docker compose --project-name "$PROJECT_NAME" -f compose.yaml up -d

Data volumes (these persist your data across restarts):
  ${PROJECT_NAME}_compass_mongo_data
  ${PROJECT_NAME}_compass_supertokens_postgres_data

To completely remove Compass (including all data):
  $HELPER_FILE stop
  docker volume rm ${PROJECT_NAME}_compass_mongo_data
  docker volume rm ${PROJECT_NAME}_compass_supertokens_postgres_data
  rm -rf "$COMPASS_HOME"

EOF
