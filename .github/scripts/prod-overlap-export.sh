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

resolve_principal_id() {
  if [[ -n "${PROD_OVERLAP_PRINCIPAL_ID:-}" ]]; then
    if [[ "$PROD_OVERLAP_PRINCIPAL_ID" =~ ^[0-9a-fA-F]{24}$ ]]; then
      echo "$PROD_OVERLAP_PRINCIPAL_ID"
      return 0
    fi
    echo "PROD_OVERLAP_PRINCIPAL_ID is not a 24-char hex ObjectId" >&2
    return 1
  fi

  local raw
  raw="$(
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
  const dbNames = [...new Set(["prod_calendar", ...databases])];

  const tryBookingSlugs = (compassDb) => {
    for (const slug of slugs) {
      const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const row = compassDb.bookingPage.findOne(
        {
          $or: [
            { bookingSlug: slug },
            { bookingSlug: new RegExp("^" + escaped + "$", "i") },
          ],
        },
        { userId: 1 },
      );
      if (row && row.userId) {
        print(row.userId.valueOf());
        quit(0);
      }
    }
    const fuzzy = compassDb.bookingPage.findOne(
      { bookingSlug: { $regex: /tyler/i } },
      { userId: 1 },
    );
    if (fuzzy && fuzzy.userId) {
      print(fuzzy.userId.valueOf());
      quit(0);
    }
  };

  const tryTylerUser = (compassDb) => {
    const owner = compassDb.user.findOne(
      {
        $or: [
          { name: "Tyler Dane" },
          { firstName: "Tyler", lastName: "Dane" },
          { email: "tyler@keepsoftwaresimple.com" },
          { email: "tyler@tylerdane.com" },
          { email: "tyler@switchback.tech" },
          {
            identities: {
              $elemMatch: { email: { $regex: /^tyler@/i } },
            },
          },
        ],
      },
      { _id: 1 },
    );
    if (owner && owner._id) {
      print(owner._id.valueOf());
      quit(0);
    }
  };

  for (const name of dbNames) {
    tryBookingSlugs(db.getSiblingDB(name));
  }
  for (const name of dbNames) {
    tryTylerUser(db.getSiblingDB(name));
  }
  quit(2);
'
REMOTE
  )"
  printf '%s\n' "$raw" | grep -Eo '[0-9a-fA-F]{24}' | head -1
}

PRINCIPAL_ID="$(resolve_principal_id || true)"

if ! [[ "${PRINCIPAL_ID:-}" =~ ^[0-9a-fA-F]{24}$ ]]; then
  echo "Could not resolve principal id (set PROD_OVERLAP_PRINCIPAL_ID to skip Mongo lookup)" >&2
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
