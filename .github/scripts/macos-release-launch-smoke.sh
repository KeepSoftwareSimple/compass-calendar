#!/usr/bin/env bash
# Launch a stapled Compass.app once on macOS CI and assert the main window title.
# Unauthenticated only: no credentials, no signed-in flows.
set -euo pipefail

APP_PATH="${1:?Usage: macos-release-launch-smoke.sh /path/to/Compass.app [timeout_seconds]}"
TIMEOUT_SECONDS="${2:-90}"

if [ ! -d "$APP_PATH" ]; then
  echo "::error::App bundle not found: ${APP_PATH}"
  exit 1
fi

cleanup() {
  osascript -e 'tell application "Compass" to quit' 2>/dev/null || true
  killall Compass 2>/dev/null || true
}
trap cleanup EXIT

open -n "$APP_PATH"

deadline=$((SECONDS + TIMEOUT_SECONDS))
last_title=""
while [ "$SECONDS" -lt "$deadline" ]; do
  last_title="$(osascript 2>/dev/null <<'APPLESCRIPT' || true
tell application "System Events"
  if not (exists process "Compass") then return ""
  tell process "Compass"
    if (count of windows) = 0 then return ""
    return title of window 1
  end tell
end tell
APPLESCRIPT
)"
  if [ "$last_title" = "Compass" ]; then
    echo "Release launch smoke passed (window title: Compass)"
    exit 0
  fi
  sleep 2
done

echo "::error::Timed out waiting for Compass window title (last: ${last_title:-<none>})"
exit 1
