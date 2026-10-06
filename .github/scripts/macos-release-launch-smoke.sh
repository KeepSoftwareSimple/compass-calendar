#!/usr/bin/env bash
# Launch a stapled Compass.app once on macOS CI and assert the native main window.
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
last_state=""
while [ "$SECONDS" -lt "$deadline" ]; do
  last_state="$(osascript 2>/dev/null <<'APPLESCRIPT' || true
tell application "System Events"
  if not (exists process "Compass") then return "no-process"
  tell process "Compass"
    if (count of windows) = 0 then return "no-window"
    set winId to identifier of window 1
    if winId is not "Compass" then return "bad-window-id:" & winId
    try
      set welcomeModal to first UI element of window 1 whose identifier is "compass-native-welcome-modal"
      if exists welcomeModal then return "ok:welcome-modal"
    end try
    try
      set header to first UI element of window 1 whose identifier is "compass-native-header"
      if exists header then return "ok:header"
    end try
    return "waiting-native-ui"
  end tell
end tell
APPLESCRIPT
)"
  case "$last_state" in
    ok:*)
      echo "Release launch smoke passed (native window identifier Compass, ${last_state#ok:})"
      exit 0
      ;;
  esac
  sleep 2
done

echo "::error::Timed out waiting for native Compass window (last: ${last_state:-<none>})"
exit 1
