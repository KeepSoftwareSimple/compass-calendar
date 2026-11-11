#!/usr/bin/env bash
# Probe GitHub-hosted Mac display tools and optionally request a larger guest resolution.
# VMware resolutionSet is documented for Intel images (actions/runner-images#8606).
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
PROBE_ONLY="${MACOS_DISPLAY_PROBE_ONLY:-0}"

log() { echo "[macos-ci-display] $*"; }

log "arch=$(uname -m) os=$(sw_vers -productVersion) runner=${RUNNER_NAME:-unknown}"

log "=== system_profiler SPDisplaysDataType (head) ==="
system_profiler SPDisplaysDataType 2>/dev/null | head -80 || log "system_profiler unavailable"

log "=== NSScreen geometry ==="
swift "$ROOT/.github/scripts/macos-log-screen-geometry.swift" || log "Swift NSScreen probe failed"

VMWARE="/Library/Application Support/VMware Tools/vmware-resolutionSet"
if [[ -x "$VMWARE" ]]; then
  if [[ "$PROBE_ONLY" == "1" ]]; then
    log "vmware-resolutionSet present (probe-only; not applying)"
  else
    log "Applying vmware-resolutionSet 2560 1440"
    if "$VMWARE" 2560 1440; then
      sleep 2
      log "NSScreen after VMware resize:"
      swift "$ROOT/.github/scripts/macos-log-screen-geometry.swift" || true
    else
      log "vmware-resolutionSet failed with exit $?"
    fi
  fi
else
  log "vmware-resolutionSet not installed (common on arm64 images)"
fi

if command -v displayplacer >/dev/null 2>&1; then
  log "=== displayplacer list ==="
  displayplacer list || log "displayplacer list failed"
else
  log "displayplacer not on PATH"
fi
