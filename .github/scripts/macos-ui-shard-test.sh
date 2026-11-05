#!/usr/bin/env bash
# Run a prebuilt Compass UI test shard (test-without-building + -only-testing).
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
export ROOT
cd "$ROOT/apps/calendar-macos"

shard="${MACOS_UI_SHARD:?Set MACOS_UI_SHARD to 1-4}"
shard_file="$ROOT/.github/macos-ui-shards.json"

mapfile -t classes < <(
  MACOS_UI_SHARD="$shard" ROOT="$ROOT" python3 - <<'PY'
import json
import os
import sys

path = os.path.join(os.environ["ROOT"], ".github/macos-ui-shards.json")
shard = os.environ["MACOS_UI_SHARD"]
with open(path, encoding="utf-8") as f:
    data = json.load(f)
classes = data.get("shards", {}).get(str(shard))
if not classes:
    print(f"Unknown or empty shard {shard!r}", file=sys.stderr)
    sys.exit(1)
for name in classes:
    print(name)
PY
)
if ((${#classes[@]} == 0)); then
  echo "Shard $shard has no classes in $shard_file" >&2
  exit 1
fi

only_testing=()
for class_name in "${classes[@]}"; do
  only_testing+=(-only-testing:"CompassUITests/${class_name}")
done

common_args=(
  -project Compass.xcodeproj
  -scheme Compass
  -destination "platform=macOS"
  -derivedDataPath build/DerivedData
  -clonedSourcePackagesDirPath build/SourcePackages
)

if [ -n "${MACOS_XCRESULT_PATH:-}" ]; then
  rm -rf "$MACOS_XCRESULT_PATH"
  common_args+=(-resultBundlePath "$MACOS_XCRESULT_PATH")
fi

echo "── xcodebuild test-without-building (CompassUITests shard ${shard}: ${#classes[@]} classes) ──"
xcodebuild test-without-building "${common_args[@]}" "${only_testing[@]}"
