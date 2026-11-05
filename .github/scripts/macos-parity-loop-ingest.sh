#!/usr/bin/env bash
# Record merge-to-main paths into the incremental parity stream (no lease state).
set -euo pipefail

MERGE_SHA=${1:?usage: macos-parity-loop-ingest.sh <merge-sha>}
FROM_SHA=${2:?usage: macos-parity-loop-ingest.sh <merge-sha> <from-sha>}

paths_file=$(mktemp)
trap 'rm -f "$paths_file"' EXIT

git diff --name-only "$FROM_SHA" "$MERGE_SHA" >"$paths_file"
python3 -B docs/acceptance/macos-parity/parity_loop.py ingest \
  --merge-sha "$MERGE_SHA" \
  --paths "$paths_file"
