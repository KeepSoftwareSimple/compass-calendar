---
name: ship
description: Ships the current Compass branch end-to-end by validating behavior, reviewing and simplifying the diff, committing, opening a ready pull request, monitoring CI, squash-merging when safe, and verifying the main-branch release. Use when the user says "ship", "ship it", "ship this branch", or asks to take current work through merged and verified delivery.
---

# Ship Compass

Take the current change from working tree to a healthy merged and deployed
result. Each stage gates the next; pushed or CI-passed is not shipped while
merge or release work remains.

## Guardrails

- Read `AGENTS.md` first. Preserve unrelated work and stage explicit paths.
- Stop on `main`. Never force-push, bypass protection, dismiss review, weaken
  tests, or rewrite published history without explicit authorization.
- Inspect live configuration rather than assuming ports, checks, or workflows.
- Pause for ambiguous product decisions, unconfirmed correctness, unrelated
  infrastructure failures, or incomplete confidence.

## 1. Preflight

1. Inspect branch, status, base-to-head diff, recent commits, remotes, and any
   existing pull request.
2. Confirm every changed file is in scope and identify affected packages,
   contracts, auth, persistence, accessibility, and release surfaces.
3. Treat `packages/core` and shared-schema changes as cross-package.
4. Confirm `gh` authentication before depending on GitHub operations.

Resume at the earliest incomplete gate when shipping a partially completed
branch.

## 2. Validate observable behavior

For browser-observable changes, use the browser tooling available in the
current agent:

- Prefer a Cursor-controlled or user-connected real Chrome session when it can
  safely exercise the required state.
- Use Claude-in-Chrome when running under Claude and it is available.
- Use Playwright for isolated, repeatable flows or when a real profile is not
  required.

Read the current launch/dev configuration, start the lightest required service,
and confirm the served URL from output. Exercise the golden path plus 2–4 edge
cases derived from new branches, boundaries, state transitions, and the exact
bug reproduction. Check console and network failures when the tool exposes
them.

Record completed evidence: URL or command, action, observed result, and
console/network status. For non-browser work, run an equivalent CLI or API
scenario. Re-run impacted scenarios after behavior-adjacent fixes.

## 3. Review correctness

Review the complete branch diff for state, race, cleanup, boundary, keyboard,
pointer, focus, accessibility, security, privacy, auth, and data-loss defects.
Use an available review skill or read-only reviewer when helpful. Fix confirmed
issues; report uncertain findings instead of guessing.

## 4. Commit implementation

Run focused checks selected from the diff. Commit in-scope implementation with
a lower-case conventional message:

```text
<type>(<scope>): <imperative description>
```

Use scopes such as `web`, `core`, `sync`, `backend`, or `scripts`.

## 5. Simplify separately

Invoke `/simplify` on the base-to-head diff. Reduce duplication, nesting,
speculative abstractions, and unnecessary React effects, refs, or state without
altering behavior.

- Commit simplification separately only when it changes files.
- Revalidate user-visible behavior after behavior-adjacent cleanup.
- Record why any added or retained `useEffect`, `useRef`, or `useState` is
  necessary.

## 6. Independent review and final gate

Run a fresh read-only reviewer against the final branch diff. Give it the
worktree, base ref, task intent, `AGENTS.md`, and complete diff without the
implementation agent's conclusions. Require confirmed, actionable findings
with severity, path/line, impact, and evidence.

Fix confirmed findings in separate commits, re-run focused verification, and
repeat review only when the diff changed. Stop if independent review is
unavailable or confidence remains incomplete.

Run checks chosen from `AGENTS.md` and `/verify-change`. At minimum include
focused regression tests and lint; include type-checking and broader package
tests for shared contracts. Confirm the worktree contains only intentional
changes.

## 7. Open a ready pull request

Rebase only when needed and safe, then repeat affected checks. Push with
upstream tracking. Reuse an existing pull request or create a non-draft one
with the implementation's lower-case conventional title.

Use the repository pull request template. Record:

- what changed and why
- simplification performed or considered
- commands and browser/API/CLI scenarios actually completed
- independent review result and confirmed findings fixed

Do not create unchecked manual-testing tasks for the user.

## 8. Monitor, merge, and verify

Watch live checks to completion. For failures, inspect logs, reproduce with the
nearest focused local command, fix the root cause in a separate commit, push,
and watch again. Address actionable review feedback.

Squash-merge only when required checks and review gates pass, the base is
correct, and validation supports confidence. Use GitHub MCP
`merge_pull_request` with `merge_method: squash`. Do not use `gh pr merge`
unless a user-provided `GH_TOKEN` is present in the environment — the
sandbox `gh` token is a read-only GitHub App installation and cannot merge.

If merge returns `403 Resource not accessible by personal access token`,
Contents write is missing on the GitHub MCP identity. Stop and tell the
user to grant **Contents: Read and write** (plus **Pull requests: Read and
write**) on `KeepSoftwareSimple/compass-calendar` for that token, and to
add the same PAT as `GH_TOKEN` on the `ccal` cloud environment. Do not
treat a 403 as a successful ship.

Capture the merge SHA, then watch workflows triggered on `main` for release
tagging, image publication, staging deployment, and health checks. Treat
release/deploy failures as incidents; report evidence rather than making
unrequested infrastructure changes.

## Report

Lead with the shipped result. Include the pull request and merge, commits,
validation evidence, independent review, CI, release/deploy result and tag,
plus remaining risks or pre-existing warnings.
