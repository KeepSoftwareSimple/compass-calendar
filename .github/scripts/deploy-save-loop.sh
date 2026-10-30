#!/usr/bin/env bash
# Continuous authenticated writes against staging during a deploy cutover.
set -euo pipefail

DURATION_SEC=${SAVE_LOOP_DURATION_SEC:-900}
INTERVAL_SEC=${SAVE_LOOP_INTERVAL_SEC:-1}
BASE_URL=${SAVE_LOOP_BASE_URL:-${STAGING_BASE_URL:-https://staging.compasscalendar.com}}
BASE_URL=${BASE_URL%/}
API_BASE="${BASE_URL}/api"
SYNTHETIC_HEADER=(-H 'x-compass-synthetic-account: true')

EMAIL=${SAVE_LOOP_EMAIL:-}
PASSWORD=${SAVE_LOOP_PASSWORD:-}
NAME=${SAVE_LOOP_NAME:-Deploy Save Loop}

resolve_provider() {
  local candidate=${STAGING_JOURNEY_PROVIDER:-}
  candidate=${candidate,,}
  candidate=${candidate//[[:space:]]/}
  if [ -n "$candidate" ]; then
    printf '%s' "$candidate"
    return 0
  fi
  printf '%s' "google"
}

provider=$(resolve_provider)
case "$provider" in
  google | microsoft | apple) ;;
  *)
    echo "STAGING_JOURNEY_PROVIDER must be google, microsoft, or apple (got \"${provider}\")." >&2
    exit 1
    ;;
esac

if [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; then
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

COOKIE_JAR=$(mktemp)
ACCESS_TOKEN=""
USE_HEADER_AUTH=0

cleanup() {
  rm -f "$COOKIE_JAR"
}
trap cleanup EXIT

unique_deploy_email() {
  local base=$1
  local tag=${GITHUB_RUN_ID:-$$}
  if [[ "$base" != *"@"* ]]; then
    printf 'deploy-save-loop.%s@compasscaltest.invalid' "$tag"
    return 0
  fi
  printf '%s' "${base/@/+deploy${tag}@}"
}

api_get() {
  if [ "$USE_HEADER_AUTH" = 1 ]; then
    curl -fsS "$@" \
      "${SYNTHETIC_HEADER[@]}" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H 'st-auth-mode: header'
  else
    curl -fsS "$@" \
      "${SYNTHETIC_HEADER[@]}" \
      -c "$COOKIE_JAR" -b "$COOKIE_JAR"
  fi
}

api_post() {
  if [ "$USE_HEADER_AUTH" = 1 ]; then
    curl "$@" \
      "${SYNTHETIC_HEADER[@]}" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H 'st-auth-mode: header'
  else
    curl "$@" \
      "${SYNTHETIC_HEADER[@]}" \
      -c "$COOKIE_JAR" -b "$COOKIE_JAR"
  fi
}

apply_sign_in_response() {
  local headers_file=$1
  local access
  access=$(header_value "$headers_file" st-access-token)
  if [ -n "$access" ]; then
    ACCESS_TOKEN=$access
    USE_HEADER_AUTH=1
    if api_get "${API_BASE}/user/profile" >/dev/null; then
      return 0
    fi
    echo "sign-in returned a token but profile check failed" >&2
    return 1
  fi
  USE_HEADER_AUTH=0
  if api_get "${API_BASE}/user/profile" >/dev/null; then
    return 0
  fi
  echo "sign-in did not establish a session" >&2
  return 1
}

sign_up_fresh_account() {
  local headers_file body_file status session_email
  session_email=$(unique_deploy_email "$EMAIL")
  headers_file=$(mktemp)
  body_file=$(mktemp)
  status=$(curl -sS -o "$body_file" -w '%{http_code}' -X POST "${API_BASE}/signup" \
    -H 'Content-Type: application/json' \
    -H 'st-auth-mode: header' \
    "${SYNTHETIC_HEADER[@]}" \
    -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
    -D "$headers_file" \
    --data "{\"formFields\":[{\"id\":\"email\",\"value\":\"${session_email}\"},{\"id\":\"password\",\"value\":\"${PASSWORD}\"},{\"id\":\"name\",\"value\":\"${NAME}\"}]}" || echo "000")
  if [ "$status" -lt 200 ] || [ "$status" -ge 300 ]; then
    rm -f "$headers_file" "$body_file"
    printf 'sign-up HTTP %s\n' "$status" >&2
    return 1
  fi
  if apply_sign_in_response "$headers_file"; then
    rm -f "$headers_file" "$body_file"
    echo "deploy-save-loop session via sign-up (${session_email})" >&2
    return 0
  fi
  rm -f "$headers_file" "$body_file"
  return 1
}

sign_in() {
  local headers_file body_file status access
  headers_file=$(mktemp)
  body_file=$(mktemp)
  status=$(curl -sS -o "$body_file" -w '%{http_code}' -X POST "${API_BASE}/signin" \
    -H 'Content-Type: application/json' \
    -H 'st-auth-mode: header' \
    "${SYNTHETIC_HEADER[@]}" \
    -c "$COOKIE_JAR" -b "$COOKIE_JAR" \
    -D "$headers_file" \
    --data "{\"formFields\":[{\"id\":\"email\",\"value\":\"${EMAIL}\"},{\"id\":\"password\",\"value\":\"${PASSWORD}\"}]}" || echo "000")
  if [ "$status" -lt 200 ] || [ "$status" -ge 300 ]; then
    rm -f "$headers_file" "$body_file"
    printf 'sign-in HTTP %s\n' "$status" >&2
    return 1
  fi
  if apply_sign_in_response "$headers_file"; then
    rm -f "$headers_file" "$body_file"
    return 0
  fi
  rm -f "$headers_file" "$body_file"
  return 1
}

pick_calendar_id() {
  local body
  body=$(api_get "${API_BASE}/calendars")
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
  status=$(api_post -sS -o /dev/null -w '%{http_code}' -X POST "${API_BASE}/event" \
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
  if sign_up_fresh_account; then
    return 0
  fi
  echo "sign-in did not succeed within 180s (API may still be deploying)" >&2
  return 1
}

wait_for_sign_in
CALENDAR_ID=$(pick_calendar_id) || {
  echo "Could not resolve a writable calendar id from GET /api/calendars" >&2
  exit 1
}

if [ "${SAVE_LOOP_BOOTSTRAP_ONLY:-0}" = 1 ]; then
  write_once || exit 1
  echo "deploy-save-loop-bootstrap ok base=${BASE_URL} provider=${provider}"
  exit 0
fi

requests=0
failures=0
deadline=$((SECONDS + DURATION_SEC))

echo "deploy-save-loop: ${DURATION_SEC}s interval ${INTERVAL_SEC}s base ${BASE_URL} provider=${provider} auth=$([ "$USE_HEADER_AUTH" = 1 ] && echo header || echo cookie)"

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
