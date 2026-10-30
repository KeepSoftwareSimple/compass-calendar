#!/usr/bin/env bash
set -euo pipefail

# Read-only prod overlap export for Tyler's calendar day. Resolves the Compass
# user id from the public booking slug, tunnels Sync on localhost, and writes a
# scrubbed JSON artifact. Never prints secrets or raw event titles.

BOOKING_SLUG="${PROD_OVERLAP_BOOKING_SLUG:-tylerdeane,tylerdane,tyler-dane}"
LOCAL_SYNC_PORT="${LOCAL_SYNC_PORT:-3010}"
OUT_PATH="${1:-prod-overlap-export.json}"

require_env() {
  if [ -z "${!1:-}" ]; then
    echo "Missing required env: $1" >&2
    exit 1
  fi
}

require_env SSH_HOST
require_env SSH_USER
require_env SSH_PRIVATE_KEY
require_env MONGO_URI
require_env SYNC_INTERNAL_AUTH_TOKEN

mkdir -p ~/.ssh
echo "$SSH_PRIVATE_KEY" > ~/.ssh/prod_overlap_key
chmod 600 ~/.ssh/prod_overlap_key
ssh-keyscan -H "$SSH_HOST" >> ~/.ssh/known_hosts 2>/dev/null || true

SSH_TARGET="${SSH_USER}@${SSH_HOST}"
SSH=(ssh -i ~/.ssh/prod_overlap_key "$SSH_TARGET")

PRINCIPAL_ID="$(
  "${SSH[@]}" "MONGO_URI=$(printf '%q' "$MONGO_URI") BOOKING_SLUG=$(printf '%q' "$BOOKING_SLUG") bash -se" <<'REMOTE'
set -euo pipefail
export BOOKING_SLUG
run_mongo_eval() {
  if command -v mongosh >/dev/null 2>&1; then
    mongosh "$MONGO_URI" --quiet --eval "$1"
    return
  fi
  if command -v docker >/dev/null 2>&1; then
    docker run --rm -e BOOKING_SLUG mongo:8 mongosh "$MONGO_URI" --quiet --eval "$1"
    return
  fi
  exit 127
}
run_mongo_eval '
  const slugs = (process.env.BOOKING_SLUG || "")
    .split(",")
    .map((slug) => slug.trim())
    .filter(Boolean);
  const databases = db.adminCommand({ listDatabases: 1 }).databases
    .map(({ name }) => name)
    .filter((name) => !["admin", "config", "local"].includes(name));
  for (const slug of slugs) {
    for (const name of databases) {
      const row = db.getSiblingDB(name).bookingPage.findOne(
        {
          $or: [
            { bookingSlug: slug },
            { bookingSlug: new RegExp("^" + slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "i") },
          ],
        },
        { userId: 1 },
      );
      if (row && row.userId) {
        print(row.userId.valueOf());
        quit(0);
      }
    }
  }
  for (const name of databases) {
    const owner = db.getSiblingDB(name).user.findOne(
      {
        $or: [
          { name: "Tyler Dane" },
          { firstName: "Tyler", lastName: "Dane" },
          { email: "tyler@keepsoftwaresimple.com" },
          { email: "tyler@tylerdane.com" },
        ],
      },
      { _id: 1 },
    );
    if (owner && owner._id) {
      print(owner._id.valueOf());
      quit(0);
    }
  }
  quit(2);
'
REMOTE
)"

if ! [[ "$PRINCIPAL_ID" =~ ^[0-9a-fA-F]{24}$ ]]; then
  echo "Could not resolve principal id for booking slug ${BOOKING_SLUG}" >&2
  exit 1
fi

ssh -i ~/.ssh/prod_overlap_key -N -L "${LOCAL_SYNC_PORT}:127.0.0.1:${LOCAL_SYNC_PORT}" "$SSH_TARGET" &
TUNNEL_PID=$!
for _ in $(seq 1 20); do
  if curl -fsS "http://127.0.0.1:${LOCAL_SYNC_PORT}/health/live" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

cleanup() {
  if [ -n "${TUNNEL_PID:-}" ] && kill -0 "$TUNNEL_PID" 2>/dev/null; then
    kill "$TUNNEL_PID" || true
  fi
}
trap cleanup EXIT

export SYNC_SERVICE_URL="http://127.0.0.1:${LOCAL_SYNC_PORT}"
export PROD_OVERLAP_PRINCIPAL_ID="$PRINCIPAL_ID"

bun run cli prod-overlap-export --out "$OUT_PATH" --day "${PROD_OVERLAP_DAY:-2026-10-31}" --time-zone "${PROD_OVERLAP_TIME_ZONE:-America/Denver}"
