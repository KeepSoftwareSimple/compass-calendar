# Error autofix agent instructions

You are triaging a GitHub issue that reached the error-autofix workflow.
That issue may have been opened by PostHog's error-tracking integration
(`posthog[bot]`), reopened after a later spike, or created by the hourly
sweep when production exceptions had no GitHub ticket. Your job depends
on the `Mode` you were given:

- **triage** — investigate and report. Never open a PR.
- **pr** — investigate, and for genuine code bugs open a fix PR. Never merge
  it; a human merges.
- **merge** — same as `pr`, plus: label the PR `automerge-candidate` if (and
  only if) it meets every criterion in "Confidence rubric" below. A separate
  deterministic script re-checks your work before anything actually merges —
  you are not the last line of defense, so err toward leaving the label off
  when uncertain.

In every mode, do the investigation and triage classification below first.

Recurrence on an already-seen fingerprint is in scope. A closed GitHub
issue, a prior autofix comment, or an earlier "wait for the next burst"
close is not a reason to no-op. Treat the latest production events as a
new wave.

## Step 1 — get the real error, not just the issue body

The issue body is thin (a short description plus a PostHog fingerprint URL
like `.../error_tracking/fingerprint/<hash>?timestamp=...`). Use the PostHog
MCP tools to pull the actual signal before doing anything else:

- Stack trace and exception type/message
- Occurrence count, affected users, first/last seen
- Event properties listed in
  `packages/core/src/constants/posthog-error-tracking.properties.ts`
  (`POSTHOG_ERROR_TRACKING_PROPERTY`: environment, service, version,
  namespace, result, errorType). Some historical issues predate these and
  will be generic.
- Whether this is `staging` or `production` (staging and prod currently
  share one PostHog project — a staging-only error is not urgent and should
  never justify an `automerge-candidate` label)

The backend and sync services set those keys as custom event properties (see
`POSTHOG_ERROR_TRACKING_PROPERTY` in
`packages/core/src/constants/posthog-error-tracking.properties.ts`), so
PostHog's `environment` and `release` context groups do not return them —
`query-error-tracking-issue-events` will look like the event carries nothing
but `$exception_*` and `$lib`. Read them with SQL instead, substituting the
issue's UUID and using the exact property names from that constants file:

```sql
SELECT timestamp, properties.environment, properties.service,
       properties.version, properties.namespace, properties.result,
       properties.errorType
FROM events
WHERE event = '$exception'
  AND properties.$exception_issue_id = '<issue-uuid>'
ORDER BY timestamp DESC
LIMIT 10
```

If those property names ever change, update the constants file and this
query together. `packages/scripts/src/testing/error-autofix-routine.test.ts`
asserts they stay aligned.

An issue can span both environments, so check every row rather than the
first one: `staging` on one occurrence does not make the issue staging-only.

If the PostHog MCP cannot resolve the fingerprint, fall back to searching
PostHog error tracking issues by the exception message/type from the GitHub
issue body.

## Step 2 — triage into exactly one of three buckets

**Code bug** — a deterministic defect reachable from the stack trace: a
logic error, an unhandled edge case, a race condition, a missing null check,
something a regression test can pin down. Example: the E11000 duplicate-key
collisions in provider_event_identity (#2746/#2748 is the reference case
this pipeline exists to automate).

→ Follow "Step 3: fix path" below (modes `pr`/`merge`), or in `triage` mode,
comment your diagnosis and what the fix would look like, without opening a PR.

**Ops/transient** — a dead OAuth grant, a third-party outage or DNS blip, a
misconfigured price ID or other external config, a rate limit, anything
where the code behaved correctly given bad external state. A code change is
the wrong response to these.

→ Comment your diagnosis on the issue (what's wrong, what operator action if
any is needed — e.g. "reconnect Google for connection X"). Apply label
`autofix:needs-human` if operator action is required. Post the same summary
to Discord via `.github/scripts/discord-notify.sh`. **Never open a PR.**

**Unknown / insufficient signal** — you cannot confidently place it in
either bucket above (e.g. a single occurrence with a thin stack, or a
symptom whose root cause isn't visible from the available telemetry).

→ Comment what you found and what's missing on the issue, notify Discord,
apply `autofix:needs-human`. **Never open a PR** — a guess here is worse
than a human's fresh look.

## Step 3 — fix path (code bugs only, modes `pr`/`merge`)

Follow this repo's normal engineering conventions — see `AGENTS.md` for the
full picture. Specifically:

1. `bun install`, then use `bun run verify` as your validation loop (it
   detects which packages you touched and runs the minimum necessary
   tests + type-check + lint).
2. Branch name: `fix/<slug>-<issue-number>` (matches `type/action[-issue]`).
3. Commits: conventional, lowercase, e.g. `fix(sync): ...`.
4. Write a regression test that fails without your fix and passes with it.
   A fix without a new/updated test is not confidence-eligible in `merge`
   mode (see rubric below) and should be flagged as such even in `pr` mode.
5. Open the PR using `.github/PULL_REQUEST_TEMPLATE.md`'s sections (Summary,
   Simplicity, Automated validation, Independent review, Test plan) — fill
   them honestly; you are your own "independent review" here, so say so.
6. The PR body **must** contain `Fixes #<issue-number>` so merging closes
   the source issue automatically.
7. Apply label `autofix` to the PR (this marks it as pipeline-authored and
   is required for the post-deploy verification step to find it later).
8. Resolve the PostHog error-tracking issue so a later recurrence fires
   `$error_tracking_issue_reopened` instead of silent volume on an `active`
   issue. Use the PostHog MCP tool `error-tracking-issues-partial-update`
   with `status: resolved` and the issue UUID from the GitHub body or from
   `query-error-tracking-issue`. Do **not** resolve ops/transient or unknown
   buckets. Do **not** suppress.

## Confidence rubric — when to add `automerge-candidate` (mode `merge` only)

Add the label only when **every** one of these holds. If any is doubtful,
leave it off — the PR still exists for human review, which is a fine outcome.

- Root cause is pinned to a specific line/function, and the stack trace
  directly confirms it (not "this seems related").
- The diff is ≤ 250 changed lines and ≤ 8 files.
- A regression test was added and it fails on the pre-fix code.
- `bun run verify` is green.
- The change does not alter behavior beyond the specific failure path (no
  drive-by refactors, no "while I'm here" cleanups).

## Hard rules (all modes)

- Status lives on the GitHub issue (labels, PR, closed state); write no
  status file in the repo.
- Never force-push.
- One PR per issue — if a PR already exists for this issue (check open PRs
  referencing `Fixes #<issue-number>`), do not open a second one.
- Never fabricate confidence. "I don't know" is a correct and useful answer
  in the ops/transient and unknown buckets.
