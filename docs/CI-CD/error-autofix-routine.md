# Routine: error-autofix

Govern the existing Error autofix loop. Do not invent a second unattended
workflow. Kill switch and mode stay as repo variables — this document does
not flip them.

```text
ROUTINE: error-autofix
TRIGGER: issues opened|reopened by posthog[bot] (or autofix* on reopen) | hourly sweep | workflow_dispatch
INPUT: GitHub issue + PostHog fingerprint
SKILL/PROMPT: .github/prompts/error-autofix.md
OUTPUT: issue comment and/or PR with Fixes #<n>
IDEMPOTENCY: one PR per issue; preflight skips labeled/already-handled unless retry
RETRY: one automatic workflow_dispatch after agent failure; then autofix:needs-human
APPROVAL: AUTOFIX_MODE=triage|pr|merge; automerge-candidate + merge-guard
STOP: repo var ERROR_AUTOFIX_ENABLED
HEARTBEAT: Discord via existing notify scripts on skip/fail/needs-human
VERIFIER: .github/scripts/autofix-merge-guard.sh (not the LLM)
```

Sources of truth:

| Concern | File |
| --- | --- |
| Trigger, concurrency, kill switch, mode, sweep job | `.github/workflows/error-autofix.yml` |
| Post-deploy Discord/GitHub follow-up + PostHog resolve | `.github/workflows/error-autofix-postdeploy.yml` |
| Agent instructions | `.github/prompts/error-autofix.md` |
| Preflight (cheap stop before the LLM) | `.github/scripts/autofix-preflight.sh` |
| Failed-run unstick + one-shot retry | `.github/scripts/autofix-unstick.sh` |
| Hourly production sweep (no LLM) | `.github/scripts/autofix-sweep.sh` |
| Merge-guard Verifier (size) | `.github/scripts/autofix-merge-guard.sh` |
| Shared notify helpers | `.github/scripts/autofix-lib.sh` |

PostHog (project 165441) GitHub HogFunctions that feed this workflow:

| Alert | Event | Id |
| --- | --- | --- |
| GitHub issue on issue created | `$error_tracking_issue_created` | `019f8174-8b63-0000-3bad-4c5eaf55c745` |
| GitHub issue on issue reopened | `$error_tracking_issue_reopened` | `01a08de7-18cf-0000-3f87-9c79f828d2ef` |
| GitHub issue on issue spiking | `$error_tracking_issue_spiking` | `01a08de7-1ab3-0000-ee95-397a959285ae` |

Those templates **create** a GitHub issue (same as the original created
alert). Recurrence on an issue that is still `active` in PostHog does not
emit `reopened`; the hourly sweep is the backstop for that case. After a
successful code-bug fix, the agent and post-deploy path resolve the PostHog
issue so the next burst becomes `reopened`.

## Stop switch and mode

- `ERROR_AUTOFIX_ENABLED` must be the string `true` or the workflow does
  not run. Flip it in GitHub → Settings → Variables. Turning it off does
  not delete existing comments, PRs, or labels. The sweep job uses the
  same kill switch.
- `AUTOFIX_MODE`:
  - `triage` — comment only, no PR
  - `pr` — may open a PR; a human merges
  - `merge` — may open a PR and label `automerge-candidate`; merge-guard
    is the Verifier and may strip that label / add `autofix:needs-human`
    when the size rails fail.
- Production deploy is never automatic. Staging-only PostHog errors must
  never receive `automerge-candidate`. The sweep queries production
  exceptions only.

## Idempotency

Key: **GitHub issue number** (plus the PostHog fingerprint in the issue
body for humans). Preflight skips if the issue already has the `autofix`
label **unless** this is a retry: `autofix:failed`, `issues.reopened`,
`workflow_dispatch` with `retry=true`, or a closed issue the sweep is
feeding back in. The prompt forbids a second PR that also says
`Fixes #<n>`. `concurrency.group: error-autofix` with
`cancel-in-progress: false` means a second issue **waits**, it does not
cancel the first run. The sweep uses its own group and caps dispatches at
2 (in flight + one queued).

Rate-limit pauses (`too_many_recent_issues`, `too_many_recent_merges`)
notify Discord and **do not** add the `autofix` label, so the next sweep
can pick the issue up again.

## Retry

Do not use “Re-run jobs” on a failed Autofix run — that reuses the
workflow file snapshot from the failed attempt. On agent failure the
unstick step comments, Discord-notifies, removes `autofix`, adds
`autofix:failed`, and dispatches **one** fresh `workflow_dispatch` with
`retry=true` (full agent output). A second failure adds
`autofix:needs-human` and stops. Operators can still dispatch a fresh run
after that.

## Sweep

`.github/scripts/autofix-sweep.sh` runs hourly (`17 * * * *`) and on
`workflow_dispatch` with a blank issue number. It is a dispatcher, not a
second agent:

1. Query production `$exception` events in the last 6 hours, grouped by
   `$exception_issue_id`.
2. Find a GitHub issue whose body contains that UUID or fingerprint.
3. Dispatch this same workflow when any of: no GitHub issue, GitHub
   closed and `last_seen` is after `closedAt`, `autofix:failed`, unlabeled,
   or last successful bot comment is older than `last_seen`.
4. If there is no GitHub issue, open one as the Actions bot and
   `workflow_dispatch` (GITHUB_TOKEN-created issues do not trigger
   `issues.opened` workflows).

Cap: `AUTOFIX_SWEEP_MAX_DISPATCHES` (default 2). Remaining rows wait for
the next hour.

## Drills (documented, not run)

Operator checklist. Mark `documented` unless a human authorizes a live
staging drill.

| Drill | Expected evidence |
| --- | --- |
| Kill switch off | Workflow `if:` skips; no agent job and no sweep |
| Missing PostHog fingerprint / MCP empty | Bucket **unknown / insufficient signal**; issue comment; `autofix:needs-human`; **no PR** |
| Duplicate open for the same issue | Preflight skip and/or prompt “one PR per issue”; **no second PR** |
| Second issue while a run is in flight | Queued behind `concurrency.group: error-autofix`; first run not cancelled |
| Staging-only error | No `automerge-candidate` |
| Merge-guard size fail | Same downgrade if files &gt; `MAX_FILES=8` or lines &gt; `MAX_LINES=250` in that script |
| `workflow_dispatch` triage on a safe issue | Comment only; mode unchanged |
| Failed agent run | Discord; issue comment with run URL; `autofix` removed; `autofix:failed`; one automatic retry; second failure → `autofix:needs-human` |
| Production recurrence on a closed GitHub issue | Sweep or reopen/spike GitHub alert; preflight reopens; fresh agent run; not skipped as already labeled |
| Sweep with no GitHub issue | Actions bot opens an issue; `workflow_dispatch`; agent runs |

## Recovery packet

Fill this when a run goes wrong. Do **not** blindly re-run the whole
workflow.

```text
task_id: <GitHub issue number>
last_successful_action: <preflight skip | comment | PR opened | merge-guard downgrade | unstick retry>
writes_after_that_point: <files, labels, comments, Discord>
external_state: <issue labels, open PRs with Fixes #<n>, Discord message, PostHog issue status>
rollback: <close stray PR, remove automerge-candidate, leave evidence>
human_decision: <re-dispatch | leave | revert>
```

## Activation (operator, after this WP)

1. Confirm `ERROR_AUTOFIX_ENABLED` and `AUTOFIX_MODE` in repo variables
   (do not change them in this WP).
2. Optional: `workflow_dispatch` on a **safe** issue with mode `triage`.
3. Table-top the drills above before considering `pr` / `merge`.
