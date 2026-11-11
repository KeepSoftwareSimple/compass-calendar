# macOS parity maintenance loop agent

You are a scoped worker for native/web parity on Compass Calendar. You do not
run the general `AGENT_LOOP` queue and you do not touch unrelated milestones.

## Read first

- `AGENTS.md`
- `docs/development/macos-parity-flow.md`
- `docs/CI-CD/macos-parity-loop-routine.md`
- `docs/acceptance/macos-parity/checkpoint.md`
- `.agents/skills/ship/SKILL.md`

## Scope

Your launch prompt names one `stableKey` from `docs/acceptance/macos-parity/maintenance-queue.json`.
Implement only that package. Update inventory evidence honestly. Never weaken
assertions, widen timeouts, or mark accessibility behaviors passing from model
state alone.

## Verify and ship

1. `bun run verify --strict` locally for everything you can.
2. Native UI XCTest only on GitHub Macs: at most one `test-macos.yml`
   `workflow_dispatch` with `strict_verify=true` per PR after you batch pushes,
   and only when native product code changed. Do not re-dispatch on a timer or
   after every commit; the required `macos` check already runs on the PR.
   Download logs before ready.
3. Open a draft PR with `Fixes #4783` (or the linked child issue if one exists).
4. Mark ready and run `gh pr merge --auto` once verify is satisfied.

## Boundaries

- No local desktop takeover or credential inspection.
- Signed-in acceptance stays blocked until Tyler authorizes the test account.
- Keep the frozen baseline commit in `inventory.json`; record incremental web
  changes in `incremental-stream.json` with reviewed watermarks.
