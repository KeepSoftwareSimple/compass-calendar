#!/usr/bin/env bash
# Local assertions for agent-loop-merge-guard.sh (path allow, conflicts, requeue).
# Run: bash .github/scripts/agent-loop-merge-guard.test.sh
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
cd "$ROOT"

PASS=0
FAIL=0
assert_contains() {
  local haystack=$1
  local needle=$2
  local name=$3
  if printf '%s' "$haystack" | grep -Fq "$needle"; then
    echo "ok ${name}"
    PASS=$((PASS + 1))
  else
    echo "FAIL ${name}: missing '${needle}' in:${haystack}" >&2
    FAIL=$((FAIL + 1))
  fi
}

assert_not_contains() {
  local haystack=$1
  local needle=$2
  local name=$3
  if printf '%s' "$haystack" | grep -Fq "$needle"; then
    echo "FAIL ${name}: unexpectedly found '${needle}' in:${haystack}" >&2
    FAIL=$((FAIL + 1))
  else
    echo "ok ${name}"
    PASS=$((PASS + 1))
  fi
}

run_guard() {
  AGENT_LOOP_GUARD_DRY_RUN=1 \
    GH_REPO="example/compass" \
    bash "${ROOT}/.github/scripts/agent-loop-merge-guard.sh" 1
}

# Formerly denied prefixes may auto-merge; merge-guard does not path-gate.
for allowed in \
  "packages/web/src/auth/providers/ConnectProviderChooser.tsx" \
  "packages/backend/src/auth/x.ts" \
  "packages/web/src/supertokens.ts" \
  "packages/sync/src/telemetry/x.ts" \
  "packages/core/src/config/compass.config.ts" \
  ".github/scripts/agent-loop-merge-guard.sh" \
  ".github/workflows/agent-loop.yml" \
  ".github/prompts/agent-loop.md" \
  "self-host/compose.yml" \
  "packages/web/src/billing/CheckoutCelebrationModal.tsx"; do
  out=$(run_guard)
  assert_contains "$out" "proceed" "${allowed} proceeds"
  assert_not_contains "$out" "downgrade:" "${allowed} is not refused"
done

out=$(
  AGENT_LOOP_GUARD_DRY_RUN=1 \
    AGENT_LOOP_GUARD_MERGEABLE=CONFLICTING \
    GH_REPO="example/compass" \
    bash "${ROOT}/.github/scripts/agent-loop-merge-guard.sh" 1
)
assert_contains "$out" "update-branch:" "conflicting PR tries update-branch"
assert_contains "$out" "proceed" "update-branch success proceeds"
assert_not_contains "$out" "downgrade:" "resolved conflict is not a human stop"
assert_not_contains "$out" "requeue:" "resolved conflict does not close the PR"

out=$(
  AGENT_LOOP_GUARD_DRY_RUN=1 \
    AGENT_LOOP_GUARD_MERGEABLE=CONFLICTING \
    AGENT_LOOP_GUARD_STILL_DIRTY=1 \
    GH_REPO="example/compass" \
    bash "${ROOT}/.github/scripts/agent-loop-merge-guard.sh" 1
)
assert_contains "$out" "update-branch:" "still-dirty PR tries update-branch"
assert_contains "$out" "requeue:" "still-dirty PR closes and requeues"
assert_not_contains "$out" "downgrade:" "conflict requeue does not add needs-human"
assert_not_contains "$out" "proceed" "still-dirty PR does not proceed"

if grep -qE 'BOOKING_LOOP_|booking-loop-|booking-automerge|LEGACY_' \
  "${ROOT}/.github/scripts/agent-loop-merge-guard.sh"; then
  echo "FAIL merge-guard still mentions booking-loop aliases" >&2
  FAIL=$((FAIL + 1))
else
  echo "ok merge-guard has no booking-loop aliases"
  PASS=$((PASS + 1))
fi

# Live stub: --auto fails with a conflict, update-branch leaves it dirty, close.
STUB_DIR=$(mktemp -d)
STUB_LOG="${STUB_DIR}/commands.log"
trap 'rm -rf "$STUB_DIR"' EXIT
cat >"${STUB_DIR}/gh" <<STUB
#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "\$*" >> "${STUB_LOG}"
cmd=\${1:-}
shift || true
if [ "\$cmd" = "pr" ]; then
  sub=\${1:-}
  shift || true
  case "\$sub" in
    view)
      json=""
      while [ "\$#" -gt 0 ]; do
        case "\$1" in
          --json) json=\$2; shift 2 ;;
          *) shift ;;
        esac
      done
      case "\$json" in
        labels) printf 'agent-automerge\\n' ;;
        additions,deletions) printf '12\\n' ;;
        autoMergeRequest) printf '\\n' ;;
        mergeable) printf 'MERGEABLE\\n' ;;
        body) printf 'Fixes #99\\n' ;;
        *) printf '\\n' ;;
      esac
      ;;
    update-branch)
      echo "update-branch failed" >&2
      exit 1
      ;;
    merge)
      if printf '%s\\n' "\$*" | grep -q -- '--disable-auto'; then
        exit 0
      fi
      if printf '%s\\n' "\$*" | grep -q -- '--auto'; then
        echo "GraphQL: Pull request is not mergeable" >&2
        exit 1
      fi
      ;;
    comment|edit|close) ;;
    *)
      echo "unexpected gh pr \$sub \$*" >&2
      exit 1
      ;;
  esac
  exit 0
fi
if [ "\$cmd" = "run" ]; then
  printf 'success\\n'
  exit 0
fi
if [ "\$cmd" = "issue" ]; then
  exit 0
fi
echo "unexpected gh command: \$cmd \$*" >&2
exit 1
STUB
chmod +x "${STUB_DIR}/gh"

out=$(
  GH_STUB="${STUB_DIR}/gh" \
    GH_TOKEN=test \
    GH_REPO="example/compass" \
    bash "${ROOT}/.github/scripts/agent-loop-merge-guard.sh" 7
)
assert_contains "$out" "closed PR #7 and requeued" "auto-merge conflict closes and requeues"
assert_not_contains "$out" "needs-human" "conflict requeue output does not mention needs-human"
if grep -q 'needs-human' "$STUB_LOG"; then
  echo "FAIL conflict requeue must not add needs-human: $(cat "$STUB_LOG")" >&2
  FAIL=$((FAIL + 1))
else
  echo "ok conflict requeue stub did not add needs-human"
  PASS=$((PASS + 1))
fi
if grep -q 'pr close 7' "$STUB_LOG"; then
  echo "ok conflict requeue stub closed the PR"
  PASS=$((PASS + 1))
else
  echo "FAIL conflict requeue stub did not close the PR: $(cat "$STUB_LOG")" >&2
  FAIL=$((FAIL + 1))
fi

echo
echo "passed=${PASS} failed=${FAIL}"
if [ "$FAIL" -ne 0 ]; then
  exit 1
fi
