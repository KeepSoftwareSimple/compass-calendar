#!/usr/bin/env bash
# Continuous authenticated writes against staging during a deploy cutover.
set -euo pipefail

DURATION_SEC=${SAVE_LOOP_DURATION_SEC:-900}
INTERVAL_SEC=${SAVE_LOOP_INTERVAL_SEC:-1}
BASE_URL=${SAVE_LOOP_BASE_URL:-${STAGING_BASE_URL:-https://staging.compasscalendar.com}}
BASE_URL=${BASE_URL%/}
API_BASE="${BASE_URL}/api"

EMAIL=${SAVE_LOOP_EMAIL:-}
PASSWORD=${SAVE_LOOP_PASSWORD:-}

if [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; then
  provider=${STAGING_JOURNEY_PROVIDER:-google}
  prefix="STAGING_JOURNEY_${provider^^}_EMAIL"
  password_key="STAGING_JOURNEY_${provider^^}_PASSWORD"
  EMAIL=${EMAIL:-${!prefix:-}}
  PASSWORD=${PASSWORD:-${!password_key:-}}
fi

if [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; then
  echo "SAVE_LOOP_EMAIL and SAVE_LOOP_PASSWORD (or STAGING_JOURNEY_* secrets) are required." >&2
  exit 1
fi

header_value() {
  local headers_file=$1
  local name=$2
  awk -v name="$name" 'BEGIN { IGNORECASE=1 } $1 == name ":" { sub(/^[^:]+:[[:space:]]*/, ""); print; exit }' "$headers_file" | tr -d '\r'
}

sign_in() {
  local headers_file body_file
  headers_file=$(mktemp)
  body_file=$(mktemp)
  if ! curl -fsS -X POST "${API_BASE}/signin" \
    -H 'Content-Type: application/json' \
    -H 'st-auth-mode: header' \
    -D "$headers_file" \
    -o "$body_file" \
    --data "{\"formFields\":[{\"id\":\"email\",\"value\":\"${EMAIL}\"},{\"id\":\"password\",\"value\":\"${PASSWORD}\"}]}"; then
    rm -f "$headers_file" "$body_file"
    echo "sign-in request failed" >&2
    return 1
  fi
  ACCESS_TOKEN=$(header_value "$headers_file" st-access-token)
  rm -f "$headers_file" "$body_file"
  if [ -z "$ACCESS_TOKEN" ]; then
    echo "sign-in succeeded but st-access-token header was missing" >&2
    return 1
  fi
}

pick_calendar_id() {
  local body
  body=$(curl -fsS "${API_BASE}/calendars" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H 'st-auth-mode: header')
  python3 - <<'PY' "$body"
import json, sys
data = json.loads(sys.argv[1])
items = data.get("calendars") if isinstance(data, dict) else data
if not isinstance(items, list):
    raise SystemExit(1)
for item in items:
    caps = (item.get("capabilities") or {})
    if caps.get("canWrite") is False:
        continue
    cid = item.get("id") or item.get("_id")
    if cid:
        print(cid)
        raise SystemExit(0)
raise SystemExit(1)
PY
}

write_once() {
  local now payload status
  now=$(date -u +%Y-%m-%dT%H:%M:%S.000Z)
  end=$(date -u -d "$now + 30 minutes" +%Y-%m-%dT%H:%M:%S.000Z 2>/dev/null || date -u -v+30M +%Y-%m-%dT%H:%M:%S.000Z)
  payload=$(CALENDAR_ID=$CALENDAR_ID NOW=$now END=$end python3 - <<'PY'
import json, os, secrets
print(json.dumps({
  "id": secrets.token_hex(12),
  "calendarId": os.environ["CALENDAR_ID"],
  "content": {"kind": "details", "title": f"deploy-save-loop {os.environ['NOW']}", "description": "", "location": ""},
  "schedule": {"kind": "timed", "start": os.environ["NOW"], "end": os.environ["END"], "timeZone": "UTC"},
  "recurrence": {"kind": "single"},
}))
PY
)
  status=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "${API_BASE}/event" \
    -H "Authorization: Bearer ${ACCESS_TOKEN}" \
    -H 'st-auth-mode: header' \
    -H 'Content-Type: application/json' \
    --data "$payload" || echo "000")
  case "$status" in
    2*) return 0 ;;
    *) printf 'event save HTTP %s\n' "$status" >&2; return 1 ;;
  esac
}

wait_for_sign_in() {
  local deadline=$((SECONDS + 180))
  while [ "$SECONDS" -lt "$deadline" ]; do
    if sign_in; then
      return 0
    fi
    sleep 2
  done
  echo "sign-in did not succeed within 180s (API may still be deploying)" >&2
  return 1
}

wait_for_sign_in
CALENDAR_ID=$(pick_calendar_id) || {
  echo "Could not resolve a writable calendar id from GET /api/calendars" >&2
  exit 1
}

requests=0
failures=0
deadline=$((SECONDS + DURATION_SEC))

echo "deploy-save-loop: ${DURATION_SEC}s interval ${INTERVAL_SEC}s base ${BASE_URL}"

while [ "$SECONDS" -lt "$deadline" ]; do
  requests=$((requests + 1))
  if ! write_once; then
    failures=$((failures + 1))
  fi
  sleep "$INTERVAL_SEC"
done

echo "deploy-save-loop-summary requests=${requests} failures=${failures} base=${BASE_URL}"
if [ "$failures" -gt 0 ]; then
  exit 1
fi
