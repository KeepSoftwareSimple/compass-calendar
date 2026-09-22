# Agent loop Routine

Autonomous manager loop that walks Compass GitHub issues across ordered
milestones from issue to PR to merge to staging smoke to the next issue.

This is a Routine, not a Skill. Milestone-specific agent prompts live
under `.github/prompts/<milestone-slug>.md`, falling back to
[`.github/prompts/agent-loop.md`](../../.github/prompts/agent-loop.md).
The launch/merge/smoke scripts live under `.github/scripts/agent-loop-*.sh`.

```text
ROUTINE: agent-loop
PURPOSE: Walk milestone issues from GitHub to merged-on-staging
  without a human in the loop, except the one-time setup listed below.
OWNER: compass-maintainers
TRIGGER: workflow_dispatch | hourly cron | pull_request labeled/closed (agent-automerge)
INPUT: GitHub issue in the first AGENT_LOOP_MILESTONES entry that has an eligible WP
SKILL/PROMPT: .github/prompts/<milestone-slug>.md or .github/prompts/agent-loop.md
OUTPUT: draft PR marked ready after bun run verify, Fixes #<n>, labeled agent-automerge; GitHub auto-merges; next WP launched on merge; staging smoke after release
IDEMPOTENCY: up to AGENT_LOOP_CONCURRENCY in-flight agents with non-overlapping partitions; agent-loop-running; skip issues with an open Fixes PR
RETRY: HTTP 429 waits for credits and retries on the hourly watchdog; conflicted automerge PRs update-branch or close and requeue; dispatch a
  fresh run for all other retryable investigation (do not "Re-run jobs" on a failed snapshot)
APPROVAL: agent-automerge + merge-guard (size, main not red) + GitHub auto-merge on required checks
STOP: repo var AGENT_LOOP_ENABLED (must be string "true"; default off)
HEARTBEAT: hourly cron kick (recovery, including docs-only merges that skip Release); Discord on merge-guard / smoke failure
VERIFIER: .github/scripts/agent-loop-merge-guard.sh (not the LLM)
STAGING: https://staging.compasscalendar.com (unauthenticated smoke only)
NEVER: enter credentials
```

Sources of truth:

| Concern | File |
| --- | --- |
| Trigger, concurrency, kill switch, launch on merge | `.github/workflows/agent-loop.yml` |
| Agent instructions | `.github/prompts/agent-loop.md` |
| Pick next WP | `.github/scripts/agent-loop-next.sh` |
| Launch (Cursor API only) | `.github/scripts/agent-loop-launch.sh` |
| Merge-guard Verifier (size) | `.github/scripts/agent-loop-merge-guard.sh` |
| Staging smoke | `.github/scripts/agent-loop-staging-smoke.sh` |
| Post-deploy (smoke + annotate; no launch) | `.github/scripts/agent-loop-postdeploy.sh` |
| Product spec | named by the issue `Spec:` link |

## Variables

| Variable | Kind | Meaning |
| --- | --- | --- |
| `AGENT_LOOP_ENABLED` | repo var | Kill switch. String `"true"` turns the workflow on. |
| `AGENT_LOOP_MILESTONES` | repo var | Ordered milestone titles, one per line (a single line may be comma separated; a multi-line value keeps commas inside titles). Higher entries drain first. Example: `Providers L: loop + CI acceleration,Booking v1.5`. Empty idles the picker; it does not invent a queue. |
| `AGENT_LOOP_CONCURRENCY` | repo var | Max in-flight WPs (default 3). The picker never launches two issues that share a partition label. |
| `AGENT_LOOP_GITHUB_TOKEN` | secret | PAT with `contents:write` + `pull_requests:write` so squash-merge triggers `release-on-main`. Falls back to `AUTOFIX_GITHUB_TOKEN`. |
| `CURSOR_API_KEY` | secret | Cloud Agents API. Required. Launch fails with `agent-loop-needs-human` and Discord if unset. |

## One-time human setup

The loop stays off until these exist. After they exist, no further input is
required; the loop pulls its work from the issue queue.

1. Repo variable `AGENT_LOOP_ENABLED` = `true`.
2. Repo variable `AGENT_LOOP_MILESTONES` set to the ordered list of
   milestone titles to drain.
3. Secret `CURSOR_API_KEY` (Cursor Dashboard → Integrations → Cloud Agents
   API key). There is no pickup-comment fallback.
4. A PAT with `contents:write` + `pull_requests:write` stored as
   `AGENT_LOOP_GITHUB_TOKEN`. Both scopes are required: `gh pr merge --auto`
   calls the `enablePullRequestAutoMerge` mutation, which a PAT without
   `contents:write` rejects with "Resource not accessible by personal
   access token". The PAT is also what makes squash-merge commits trigger
   `release-on-main` (the default `GITHUB_TOKEN` does not). The error
   autofix gate uses this same token first and falls back to
   `AUTOFIX_GITHUB_TOKEN` only when it is unset.
5. Labels `agent-automerge`, `agent-loop-running`,
   `agent-loop-waiting-for-credits`, `agent-loop-needs-human` on this
   repo (`gh label create` if missing).

Do not flip `AGENT_LOOP_ENABLED` from this document. The workflow `if:`
is the kill switch.

## Launch channel

Launch **only** via `POST https://api.cursor.com/v0/agents`. If
`CURSOR_API_KEY` is unset, launch adds `agent-loop-needs-human` and
notifies Discord. It does not comment on the issue and does not fall
back to a pickup phrase.

## Loop

1. **Pick next WP** (`.github/scripts/agent-loop-next.sh`): walk
   `AGENT_LOOP_MILESTONES` in order. An empty variable prints idle and
   launches nothing. Skip `agent-loop-running` /
   `agent-loop-needs-human`, Approval boundary `human`, open `Depends on:`
   issues, and issues with an open PR with `Fixes #<n>`. Select up to
   `AGENT_LOOP_CONCURRENCY` (default 3) issues whose partition labels do
   not overlap. Partition labels are `sync-core`, `sync-microsoft`,
   `sync-apple`, `web`, `backend`, `core`, `scripts`, `e2e`, `docs`.
   `fresh_count` idles only when it reaches N. Labels older than 3 hours
   are treated as abandoned and cleared across every listed milestone.
2. **Launch** (`.github/scripts/agent-loop-launch.sh`): accepts one or
   more issue numbers. POST the Cloud Agents API. HTTP 429 records the
   provider's retry time, labels the issue
   `agent-loop-waiting-for-credits`, and exits successfully so the hourly
   watchdog can resume it. Other launch failures (including a missing
   API key) are `agent-loop-needs-human` stops. The prompt file is
   `.github/prompts/<milestone-slug>.md` when that file exists, else
   `.github/prompts/agent-loop.md`. That prompt is the only instruction
   set; agents do not read the ship Manager skill.
3. **Agent** follows that prompt: implement the WP, open a draft PR, run
   `bun run verify --strict`, mark the PR ready, add label
   `agent-automerge` when the Approval boundary is `allow`, and stop.
   The agent does not merge and does not wait for CI.
4. **Merge guard** (`.github/scripts/agent-loop-merge-guard.sh`): when size
   is under the rails and the latest `main` Unit and E2E push runs are not
   red, enable GitHub auto-merge (`gh pr merge --auto`; the ruleset merge
   queue squash-merges and the repo deletes the branch). GitHub
   squash-merges when the required checks pass. Size failures add
   `agent-loop-needs-human` and stop. A red `main` just waits for the
   scheduled sweep. If the PR is `CONFLICTING` (or `--auto` fails with a
   conflict), the guard updates the branch onto `main`. If it is still
   dirty, it closes the PR, removes `agent-automerge` and
   `agent-loop-running`, and leaves the issue `agent-ready` so the next
   kick or launch-next can start a fresh agent. The guard never holds a
   runner waiting on CI.
5. **Launch next** (`agent-loop.yml` `pull_request` `closed` + merged):
   smoke the staging that is live now, pick WPs to top the fleet up to N,
   launch them. `Fixes #<n>` closes the merged issue. A failing smoke
   stops launches.
6. **Release on main** deploys staging (code paths only; docs-only merges
   skip deploy). The hourly cron is the watchdog for docs-only WPs.
7. **Post-deploy** (`workflow_run`): smokes the new release and annotates
   the issue. It does not pick or launch. On smoke failure it labels the
   issue `agent-loop-needs-human`.

Two launch paths: `kick` (hourly cron + `workflow_dispatch`) and
`launch-next` (automerge PR merged). `post-deploy` only smokes.

Concurrency is per job. `merge-guard` runs in `agent-merge-<pr>` with
`cancel-in-progress: true` (a newer push supersedes). `launch-next`,
`post-deploy`, and `kick` share `agent-loop` with
`cancel-in-progress: false`, so a second launch **waits** for the first.
Do not put those jobs back under one workflow-level group. The picker
fills up to `AGENT_LOOP_CONCURRENCY` (default 3) issues whose partition
labels do not overlap. Untested combinations cannot land: the Copilot PR
Review ruleset (8388539) requires a merge queue (`grouping_strategy:
ALLGREEN`, squash). Unit and E2E workflows listen for `merge_group` so
the queue can emit the required checks. If the queue rule cannot be
written, the equivalent is `strict_required_status_checks_policy: true`.

## Line limit

Merge-guard default: `MAX_LINES=4000` (additions + deletions). Override per
run with env `AGENT_LOOP_MAX_LINES`.

## Staging smoke

`GET https://staging.compasscalendar.com`, the legacy book homepage and
a known slug, `/meet/`, and `/meet/tylerdeane` must not return 5xx. 404
is success (page disabled or not yet shipped). The smoke script never
logs in.

Authenticated Settings is out of unattended smoke.
The `qa-test-staging` skill remains the signed-in sweep when a human is present
with a connected profile already signed in.

## Labels

| Label | Meaning |
| --- | --- |
| `agent-automerge` | Agent finished; merge-guard may squash-merge. |
| `agent-loop-running` | An agent is in flight for this issue. |
| `agent-loop-waiting-for-credits` | Cursor returned HTTP 429; retry only after the recorded time. |
| `agent-loop-needs-human` | Kill this issue's loop; do not pick it again. |

## Script tests (also run in the `static` CI job)

Picker and merge-guard shell tests run from `bun test:scripts` via
`packages/scripts/src/testing/agent-loop-next.test.ts`.

```bash
bash .github/scripts/agent-loop-next.test.sh
bash .github/scripts/agent-loop-merge-guard.test.sh
bash -n .github/scripts/agent-loop-*.sh
shellcheck .github/scripts/agent-loop-*.sh
```

`agent-loop-next.test.sh` drives `agent-loop-next.sh` through a `GH_STUB`
shim with canned `gh` JSON. It does not call the network.

## Drills (documented, not run)

Operator checklist. Mark `documented` unless a human authorizes a live
staging drill.

| Drill | Expected evidence |
| --- | --- |
| Kill switch off | Workflow `if:` skips; no agent job |
| Kill switch on, no eligible WP | `agent-loop-next.sh` `found=false`; no launch |
| Empty milestones | `AGENT_LOOP_MILESTONES` unset → idle; no invented queue |
| Missing API key | Launch adds `agent-loop-needs-human` and Discord; no issue comment |
| Merge-guard line limit | Same downgrade if lines > `MAX_LINES=4000` |
| Merge-guard conflict | `update-branch` then auto-merge; still dirty → PR closed, issue stays `agent-ready`, no `needs-human` |
| Staging 5xx | Smoke fails; next WP not launched |
| Credentials | Smoke and prompt never enter a password or complete OAuth |
| Second launch while in flight | Queued behind `concurrency.group: agent-loop`; first run not cancelled |
| Red main | Merge-guard prints "main is red" and does not enable auto-merge; scheduled sweep retries |

## Recovery packet

Fill this when a run goes wrong. Do **not** blindly re-run the whole
workflow.

```text
task_id: <GitHub issue number>
last_successful_action: <pick | launch | PR opened | merge-guard | smoke>
writes_after_that_point: <files, labels, comments>
external_state: <issue labels, open PRs with Fixes #<n>, Cursor agent URL>
rollback: <close stray PR, remove agent-automerge, leave evidence>
human_decision: <re-dispatch | leave | revert>
```

## Related

- Prompt: [`.github/prompts/agent-loop.md`](../../.github/prompts/agent-loop.md)
- Providers spec: [`docs/features/calendar-providers.md`](../features/calendar-providers.md)
- Booking spec: [`docs/features/booking.md`](../features/booking.md)
- Staging QA: [`.agents/skills/qa-test-staging/SKILL.md`](../../.agents/skills/qa-test-staging/SKILL.md)
- Error-autofix (sibling Routine): [`error-autofix-routine.md`](./error-autofix-routine.md)
