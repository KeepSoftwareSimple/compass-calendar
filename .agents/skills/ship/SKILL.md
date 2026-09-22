---
name: ship
version: 4
owner: compass-maintainers
last_verified: 2026-09-08
description: Take the current branch from working tree to a ready, labeled PR that GitHub merges. Use when the user says "ship" or a loop prompt reaches the PR step.
---

# Ship

Status lives on the GitHub issue (labels, open PR, closed state). Nothing in
the repo records it.

## Steps

1. **Preflight.** `git status`; work on a branch off `origin/main`, never on
   `main`; `gh auth status`; find any existing PR for the branch.
2. **Verify.** `bun run verify --strict`. Fix failures and rerun, at most two
   retries. `VERDICT: INCOMPLETE` means Chromium is missing: run
   `bunx playwright install chromium` and rerun. Never weaken a test, widen a
   timeout, or change test order to get there.

   The local verdict is evidence; CI is the gate. A sandbox slow enough to
   blow Playwright's 30s budget fails specs the diff cannot reach, and that
   is the sandbox failing, not the change. When every failure is a timeout
   (`page.goto`, `waitForLoadState`, axe `frame.evaluate`) rather than an
   assertion, and none of them lands in a file the diff can affect, name the
   failing specs and that evidence in the PR and ship anyway. Anything you
   cannot show is environmental is a real failure and blocks.
3. **Self-check.** Read the complete base-to-head diff as a stranger would:
   state, races, cleanup, keyboard and focus paths, accessibility, auth,
   data loss. If the diff added more than a screen of new abstraction, run
   the `simplify` skill. Confirmed problems become isolated fix commits, then
   rerun step 2.
4. **PR.** Open a **draft** PR against `main` using
   `.github/PULL_REQUEST_TEMPLATE.md`: `Fixes #N`, what changed and why, the
   pasted `VERDICT:` line and checks run. No unchecked manual-testing boxes.
   Mark it ready once step 2 is satisfied; reviews run on ready PRs only,
   so a draft that never becomes ready is a stop, not a handoff.
5. **Label and merge.** Mark the PR ready, add `agent-automerge`, and enable
   auto-merge yourself (`gh pr merge --auto --squash`). `main` takes changes
   only through the merge queue, so a direct merge is refused by rule; GitHub
   squash-merges through the queue once required checks pass, and the merge
   launches the next work package.

   Do not wait for a human on a PR that is green and mergeable. The gate is
   the line-count rail and the main-is-not-red check in
   `.github/scripts/agent-loop-merge-guard.sh`, and those stay. Path prefixes
   are not a gate: no denylist exists in this repo, so do not look for one or
   hold a PR because you cannot find it.

   Never close/reopen the PR, push empty commits, or merge `main` in just to
   re-run CI (merge `main` only for a real conflict).

## Escalate

Comment on the issue with the decision needed, the recommended option, and
the cost of waiting, then label `agent-loop-needs-human`. Reasons: product
ambiguity, production deploy, secrets, OAuth grants, deletion, access grants,
verify still failing after two retries.

## Anti-patterns

See [`anti-patterns.md`](../anti-patterns.md).
