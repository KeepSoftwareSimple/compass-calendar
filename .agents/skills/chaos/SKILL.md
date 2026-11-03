---
name: chaos
version: 2
owner: compass-maintainers
last_verified: 2026-09-04
description: Exercise Compass as a real signed-in user, first through the intended flow and then with focused adversarial behavior; diagnose and fix confirmed UX, security, reliability, performance, accessibility, or data-integrity defects; simplify and ship the result. Use before a production release, when asked to perform exploratory or chaos testing, or when a realistic browser pass should drive a fix through merge.
---

## When

Before a production release, or when asked for exploratory / chaos testing.

## Steps

Prepare → happy path → focused probes → diagnose/fix → simplify/review/ship.

## Output

Evidence of signed-in exercise plus shipped fixes, or a report of stops.

## Pass

Happy path worked; probes were focused; credentials were not entered by the agent.

## Anti-patterns

Do not enter credentials. See
[`anti-patterns.md`](../anti-patterns.md).

## Escalate

Auth/setup missing, production-only defect, or a product fork.

# Chaos

Treat a real, existing signed-in profile as an observation and interaction
surface—not a source for credentials, cookies, tokens, or private data. Build
confidence from visible behavior and reproducible evidence, then make the
smallest fix that removes a confirmed defect.

## Boundaries

- Target local development or an explicitly named non-production environment.
  Never probe production, payment flows, or third-party systems by default.
- Verify the selected account visibly before mutating data. If the expected
  test account is unknown, ambiguous, or not signed in, stop and ask the user.
- Use unique, clearly test-labelled records. Preserve pre-existing records;
  remove only records created by this run through the normal recoverable UI,
  then reload to confirm cleanup persisted.
- Do not enter credentials, grant/revoke OAuth, change account/security
  settings, bypass browser security warnings, or perform irreversible actions.
  Report those cases with a safe manual reproduction instead.
- Bound adversarial testing: do not use load generation, fuzz external APIs,
  scrape data, bypass authorization, or test other users' data. Test only the
  current account and normal product surfaces.
- Treat an exception, failed request, data loss, stale UI, inaccessible flow,
  privacy exposure, or significant interaction latency as a finding even when
  the UI appears to complete the action.

## 1. Prepare the test surface

1. Read `AGENTS.md`, inspect the current branch and diff, and identify the
   release-critical and recently changed user-visible flows.
2. Read the relevant acceptance docs and tests. Follow
   `docs/development/local-development.md` if the required local services or
   configuration are not healthy.
3. Select the best available real-browser surface that holds the signed-in test
   session. Honor an explicitly requested browser. Prefer a user-connected
   browser or Chrome session for authenticated flows; use Computer Use only
   when a browser-specific tool cannot perform the required visible action.
   Use isolated Playwright only for repeatable coverage that does not require
   the real account.
4. Navigate to the named environment, identify the account from rendered UI,
   and record the target URL, browser surface, account state, and baseline
   console/network condition. Do not inspect browser storage, cookies, or
   passwords.
5. If the selected environment or session is not suitable, stop with the exact
   setup needed. Do not substitute anonymous coverage for an authenticated pass.

## 2. Establish the happy path

Act as an ordinary user before trying to break anything. Drive the smallest
end-to-end scenario that covers the changed area, observing rendered state
after each action.

For calendar changes, typically create one uniquely named event, edit it,
navigate between views/dates, reload, and confirm the expected persisted state.
Also exercise the command palette or keyboard path when relevant. Check error
UI, console, and network behavior whenever tooling exposes them.

Use actual evidence, not a successful click: verify saved fields, event timing,
visibility, selection/focus, route/view state, and persistence after reload.

## 3. Run focused chaos probes

Derive a small set of probes from the diff, the happy path, and the component's
state transitions. Favor meaningful boundaries over random clicking. Stop once
coverage is sufficient or a confirmed defect needs investigation.

Probe the applicable categories:

- **Input and time:** empty or whitespace-only values, long labels, rapid
  edits, Enter/Escape, all-day/timed transitions, date boundaries, DST/timezone
  boundaries, and overlapping events.
- **Interaction:** fast repeated clicks, double submit, navigation while a save
  is pending, reload/back/forward, resize/move then cancel, command and mouse
  paths, keyboard-only traversal, visible focus, and small viewport behavior.
- **State and resilience:** offline/slow/failed requests when the local test
  harness can simulate them safely; stale UI after reload; retry behavior;
  duplicate/lost writes; and whether errors provide a recoverable next step.
- **Authorization and privacy:** switch only through ordinary visible UI;
  confirm error states never disclose another user's data or internal details.
  Do not attempt privilege escalation or access-control bypasses.
- **Accessibility and performance:** semantic names, focus restoration,
  keyboard reachability, announcement of async/error state, motion behavior,
  console warnings, obvious layout shift, and interaction latency. Invoke
  `/a11y-audit` for changed UI and use its findings as evidence.

Capture a minimal reproduction for every issue: preconditions, exact actions,
expected versus actual result, console/network evidence, and a screenshot when
it clarifies the problem. Classify observations as confirmed defects, likely
defects needing product judgment, or clean coverage. Never manufacture a bug
report from a speculative concern.

## 4. Diagnose and implement

1. Reproduce each confirmed defect with the narrowest reliable browser, test,
   API, or CLI scenario. Locate the owning package and read nearby tests before
   changing code.
2. Implement the smallest durable correction. Preserve boundaries: shared
   contracts live in `packages/core`, web tests use semantic queries and
   `user-event`, and no test-only production escape hatches.
3. Add a focused regression test when it protects real behavior. Keep the
   original user-flow reproduction as a manual acceptance check.
4. Re-run the affected browser scenario and inspect console/network state.
   Run `bun run verify --strict`; include lint and type checking whenever the
   changed boundary requires them.
5. If a finding cannot be safely reproduced or fixed within scope, do not paper
   over it. Report its evidence, impact, and recommended owner/action.

## 5. Simplify, review, and release

1. Run the `simplify` skill on the complete base-to-head diff after the fix. Apply
   behavior-preserving simplifications, commit them separately when they change
   code, and re-run behavior-adjacent checks.
2. Follow the `ship` skill for verify, ready PR, and auto-merge. Do not
   bypass its safeguards.
3. Do not create or merge a pull request if validation is incomplete, an
   unrelated dirty change overlaps, a material finding remains unresolved, or
   the target/base branch is unclear. State the blocker instead.

## Report

Lead with the release outcome. Include the environment and verified account
state, happy-path evidence, probes completed, findings by classification,
fixes and regression tests, browser/API evidence after the fix, commands run,
simplification result, PR/merge/CI status, and any skipped or residual risk.
