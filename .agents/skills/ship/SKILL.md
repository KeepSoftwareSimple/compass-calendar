---
name: ship
version: 5
owner: compass-maintainers
last_verified: 2026-11-02
description: Take the current branch from working tree to a ready PR that the merge queue merges. Use when the user says "ship" or a loop prompt reaches the PR step.
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

   The local verdict is evidence; CI is the gate. When `test:web`,
   `test:a11y`, or `test:e2e` fails, verify reruns the failing files on the
   branch and on `origin/main` in a temporary worktree and prints a
   `Baseline against origin/main:` block that sorts each failure into NEW
   (fails only on the branch), PRE-EXISTING (fails on main too), or FLAKY
   (passed on rerun). Only NEW failures make the verdict `FAIL`; fix those.
   Paste the PRE-EXISTING and FLAKY lists into the PR body as-is. A failure
   verify cannot classify (a crash, an error outside a test) stays `FAIL`;
   show why it is environmental in the PR or treat it as real.
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
5. **Merge.** Mark the PR ready and run `gh pr merge --auto`. `main` takes
   changes only through the merge queue, so a direct merge is refused by
   rule; GitHub squash-merges through the queue once required checks pass.
   No label is involved. The required checks are the whole gate: no
   line-count rail, no path denylist, nothing to look for or wait on.

   Do not wait for a human on a PR that is green and mergeable. If the queue
   drops the PR on a check the diff cannot reach (a runner timeout, a UI
   test in a surface you did not touch) and the same check passed on the PR
   head, say so once on the PR and run `gh pr merge --auto` again. A second
   drop for the same reason is a human call: comment the evidence and stop.

   Never close/reopen the PR, push empty commits, or merge `main` in just to
   re-run CI (merge `main` only for a real conflict).

## Escalate

Comment on the issue with the decision needed, the recommended option, and
the cost of waiting, then label `agent-loop-needs-human`. Reasons: product
ambiguity, production deploy, secrets, OAuth grants, deletion, access grants,
verify still failing after two retries.

## Anti-patterns

See [`anti-patterns.md`](../anti-patterns.md).
