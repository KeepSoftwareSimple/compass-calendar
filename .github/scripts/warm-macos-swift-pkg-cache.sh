#!/usr/bin/env bash
# Prebuild SwiftPM test targets so swift-packages can `swift test --skip-build`.
# Runs beside xcodebuild in macos-build on a package-cache miss.
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT"

packages=(CompassKit CompassData CompassUI)
for name in "${packages[@]}"; do
  dir="apps/calendar-macos/${name}"
  if [ ! -f "${dir}/Package.swift" ]; then
    echo "Skip ${name}: no Package.swift"
    continue
  fi
  echo "── warm swift build --build-tests --package-path ${dir} ──"
  start=$(date +%s)
  swift build --package-path "${dir}" --build-tests
  echo "── ${name} warm build finished in $(( $(date +%s) - start ))s ──"
done
