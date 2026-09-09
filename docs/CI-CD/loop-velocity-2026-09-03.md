# Loop velocity review: 2026-09-03

What slowed the agent loops on 2026-09-03 (10:25 to 21:30 Pacific, three
loops running: booking v1.5, embedded billing, providers L), and the plan to
fix each cause. Numbers come from the 1,000 workflow runs GitHub recorded in
that window and the failed-job logs behind them.

## Where the time went

A booking WP cycle is: agent implements (4 to 16 min) → PR open → CI + merge
(7 to 55 min) → release + deploy + smoke (4.6 min) → next launch. The floor
for "PR open to merged" was 7 min, which is one e2e run. Everything above the
floor was one of the causes below.

| Workflow | Runs | Failed | Cancelled | Notes |
| --- | ---: | ---: | ---: | ---: |
| Unit (`test-unit.yml`) | 224 | 82 | 2 | 77 of the 140 successful runs were the `push` duplicate |
| E2E (`test-e2e.yml`) | 137 | 8 | 31 | p50 6.6 min, six runs over 7.8 min against an 8 min step cap |
| Booking loop | 194 | 0 | 56 | 67 more were skipped no-op runs |
| Performance budget | 96 | 29 | 5 | every sampled failure is the same infra flake |
| Release on main | 32 | 2 | 0 | 4.6 min each, serial after every merge |

## Causes, ranked by lost time

### 1. `unit (web)` died for three hours after #3280 merged

From 00:55 to 03:50 UTC, 82 unit runs failed on every branch and main was red
for 7 of 9 merges. Every log ends the same way: `TimePicker.test.tsx` passes,
then 20 to 80 s of silence, then "The runner has received a shutdown signal"
(SIGTERM, exit 143). That message is the hosted runner VM dying, which is what
a memory or CPU blow-up looks like, not a hung assertion (bun's per-test
timeout would have fired on a hang). The next file in shard 2 is
`TimePickers.test.tsx`, and the first red main run is the merge commit of
#3280 (copy icons: `CopyButton` gained `onMouseDown`/`onKeyDown`
`stopPropagation` and `EventForm` lost several elements). The run before it was
green.

The loop made it worse. The agent on #3285 spent 2.5 h and 18 commits
rewriting the TimePicker tests around the symptom (drop `user.tab`, a
three-option list, click-before-tab), merged main into its branch eight times
because every merge conflicted, and closed/reopened the PR to re-fire CI. That
one branch produced 30 unit runs, 12 e2e runs and 8 Lighthouse runs. The other
loops kept self-merging onto red main.

Plan:

- Reproduce at `5798d7c` with `bun test TimePickers.test.tsx` under a memory
  cap and fix the component or harness, then restore the assertions #3285
  weakened. Owner: one human-reviewed PR, not a loop WP.
- Default `WEB_TEST_SHARDS` to 4 in `test-parallel.ts`. Shard 2 is 191 files
  in one jsdom process; halving it keeps peak RSS clear of the 7 GB runner.
- Add one rule to `.github/prompts/booking-loop.md`: "runner has received a
  shutdown signal" during a test step is memory, not a hang. Do not rewrite
  tests to route around it; bisect the merge that introduced it or stop with
  `booking-loop-needs-human`.
- Merge-guard refuses to merge onto a red main: before `gh pr merge`, check the
  latest `Test` run on `main`; if it failed, label `booking-loop-needs-human`
  and stop. One deterministic check in `booking-loop-merge-guard.sh`.

### 2. The booking loop cancels its own runs

56 Booking loop runs were cancelled: 41 merge-guards, 13 post-deploy
(smoke + launch next), 2 hourly kicks. Cause: `booking-loop.yml` puts all
three jobs under one `concurrency.group: booking-loop` with
`cancel-in-progress: false`. GitHub keeps one pending run per group and
cancels the older pending run when a newer one arrives. Merge-guard holds the
group for up to 20 min inside `gh pr checks --watch`, and every PR push in the
repo (67 skipped no-op runs) enters the same group. A cancelled post-deploy
means the next WP waits for the hourly cron. A cancelled merge-guard means the
PR waits for the next label or push event.

Plan:

- Remove the workflow-level group. Give `merge-guard` its own
  `concurrency: booking-merge-${{ github.event.pull_request.number }}` and
  keep `post-deploy` and `kick` on `booking-loop`.
- Stop holding a runner while CI runs: after the path and size checks,
  `gh pr merge --auto --squash --delete-branch`. GitHub merges when the
  required checks pass, still with the PAT so release fires. The
  `--watch` loop and the 20 min timeout go away.

### 3. Unit runs twice per PR push

`test-unit.yml` triggers on `pull_request` and on `push` with no branch
filter, so every agent push runs lint, knip, type-check and the five-leg
matrix twice. 77 of the successful unit runs were the `push` duplicate, and
the two results confused the agent on #3285 ("push unit (web) passed, PR
run failed").

Plan: PR #3284 (providers L WP-03) already limits `push` to `main`, matching
`test-e2e.yml`. It is blocked only because it touches `.github/`. Review and
merge it.

### 4. Performance budget is red 30% of the time for an infra reason

29 of 96 Lighthouse runs failed. Every failure sampled is
"Static server never came up": `npx --yes serve@14` did not start within 30 s.
The check is not required, but it paints PR check lists red, and agents
watching `gh pr checks` treat it as a stall (PR #3292's own summary). It also
runs on every PR touching `packages/web`, which is most of them: 220 runner
minutes in the window.

Plan:

- Merge PR #3292 (providers L WP-07): run on `main` and nightly, not per PR.
- Fix the flake anyway: add `serve` to devDependencies so it comes from the
  bun cache instead of an npx download, and start it with `bunx serve`.

### 5. e2e is the critical path with no headroom

The e2e job is one Playwright worker running 107 tests serially with two
retries: p50 6.6 min, six runs over 7.8 min, and main's 23:35 run was killed
by the 8 min step cap mid-axe-scan. The fastest PR-to-merge time all day was
7 min, all of it e2e.

Plan: shard e2e with Playwright `--shard` in a two- or four-leg matrix
(providers L WP-04, #3215, is this). Keep one worker per leg. Container init
plus install is 50 s per leg, so a four-way shard lands around 2.5 min. Keep
the 8 min step cap; it was right.

### 6. `unit (scripts)` open-handle hang

Twice in the window (main at 23:35, PR #3204 at 23:40) the scripts suite
passed every test, then sat for four minutes until `test-mongo-env.ts` killed
it, failing the run. That turned main red and stretched #3204 to 55 min. The
leak is documented in `test-mongo-env.ts` and not fixed.

Plan: in `test-mongo-env.ts`, pipe stdout, treat bun's
`Ran N tests across M files` summary as the result, and kill the child once
it appears. Exit with bun's pass/fail, not with the leak.

### 7. Every PR conflicts with every other PR

Each WP appends a ledger line to `.agents/ledger.md`, so every squash merge on main
conflicts with every open PR. That is why #3285 carried eight `merge(main)`
commits, each of which cost a full CI round. Handoff files under
`.agents/handoffs/<issue>.md` already hold the same information.

Plan: stop writing per-WP rows to `.agents/ledger.md` from the loop. Keep the
handoff file as the record; regenerate the ledger from handoffs if a table is
still wanted. Add to the loop prompt: never close/reopen a PR or push
merge-from-main commits to re-run CI.

### 8. Release runs serially after every merge and gates the next launch

32 releases at 4.6 min each (tag, four Docker builds with no layer cache, two
deploys, health checks), then smoke, then the next WP is launched. Two
releases failed on a Docker Hub pull flake (`mongo:8` "No such image") during
the health check. With 13 booking WPs, that is over an hour of the loop
waiting on deploys it does not need.

Plan:

- Merge PR #3293 (providers L WP-08): Docker layer cache and one Bun pin.
- Launch the next WP from merge-guard right after the merge instead of from
  post-deploy. Keep post-deploy smoke; on failure it labels the merged issue
  `booking-loop-needs-human` and stops further launches. The next agent's work
  never depended on staging.

## What landed on 2026-09-04

| Cause | Change | PR |
| --- | --- | ---: |
| 1 | Four web shards with a 5 GB RSS guard that names the shard; the weakened TimePicker assertions restored and green under that layout | #3300, #3301 |
| 1, 2, 8 | Merge guard enables GitHub auto-merge after the size, path and red-main checks; per-PR guard concurrency; next WP launches on merge; the agent labels and stops instead of self-merging | #3299 |
| 3 | Unit runs once per PR push | #3284 |
| 4 | Lighthouse on `main` and nightly only; `serve` from the bun install; script budget recalibrated to 1,000 KB | #3292, #3300 |
| 5 | e2e in four shards behind one required `e2e` gate: 6.5 min to about 3.5 min wall | #3300 |
| 6 | Scripts runner exits on Bun's summary instead of a four-minute hang | #3300 |
| 7 | `.agents/ledger.md` deleted; status is the issue's labels, PR and closed state | #3299 |
| 8 | Docker layer cache, one Bun pin | #3293 |

Open loop PRs that still add a ledger row (#3283, #3294) will conflict on
the deleted file; drop the row when rebasing them.

## Order of work

1. Merge the three blocked providers L PRs today: #3284 (unit once), #3292
   (perf budget off PRs), #3293 (Docker cache). They are done and reviewed.
2. Fix the `TimePickers` memory blow-up and restore the weakened tests (cause 1).
3. Booking loop workflow: per-PR merge concurrency, `--auto` merge, red-main
   guard, launch-after-merge (causes 2, 1, 8). One PR to `.github/`.
4. Loop prompt: shutdown-signal rule, no retrigger tricks, no ledger row
   (causes 1, 7).
5. `WEB_TEST_SHARDS=4`, scripts-runner summary exit, `serve` from the bun
   cache (causes 1, 6, 4).
6. Shard e2e (cause 5, #3215).

Items 3 to 6 each touch `.github/` or the test runners, so they need a human
merge. None of them adds a new job, service, or config knob.
