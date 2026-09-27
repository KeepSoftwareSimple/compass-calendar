# CI audit, September 2026

Measured 2026-09-05 against the two required-check workflows, `Unit`
(`test-unit.yml`, required contexts `static` and `unit`) and `E2E`
(`test-e2e.yml`, required context `e2e`). Trigger: PR #3388 needed a manual
rerun because e2e run 33938967483 lost three of four shards to the
12-minute job timeout, and the failure read as "cancelled" rather than as a
failed step.

Method: `gh api .../actions/workflows/{id}/runs` for the newest 400 runs per
workflow, `/actions/runs/{id}/attempts/{n}/jobs` for every attempt, and the
job logs where a step name alone did not explain a failure. Collection and
analysis scripts were throwaway; the numbers below are the output. Durations
are wall clock from `started_at` to `completed_at`. "Wall clock" for a run
is first job start to last job end of the final attempt.

The 400-run window is short: 2026-09-03 to 2026-09-05. The repo lands
roughly 130 runs per workflow per day. The `Unit` workflow was restructured
on 2026-09-04 (`lint`/`knip`/`type-check` folded into `static`, `unit (web)`
split into `unit-leg (web, 1)` and `(web, 2)`), so its per-job table below
uses the 100 newest runs, all on the current layout. E2E job names did not
change in the window.

## Before

### Run level (400 runs each)

| Workflow | Success | Failure | Cancelled | Runs with a rerun | p50 wall clock (PR) | p95 wall clock (PR) |
|---|---|---|---|---|---|---|
| E2E | 322 | 13 | 64 | 2 (0.5%) | 4m06s | 7m13s |
| Unit | 301 | 78 | 20 | 18 (4.5%) | 2m01s | 6m06s |

Cancelled runs are almost all `cancel-in-progress` on a superseding PR push,
not failures. The rerun rate undercounts pain: agents rarely press "rerun",
they push again, which shows up as a fresh run.

On the 100 newest runs (current job layout, 2026-09-04 to 09-05) the
successful-run wall clock was:

| Workflow | Event | n | p50 | p95 |
|---|---|---|---|---|
| E2E | pull_request | 32 | 3m32s | 9m05s |
| E2E | merge_group | 26 | 3m36s | 4m34s |
| E2E | push (main) | 24 | 3m40s | 5m58s |
| Unit | pull_request | 37 | 1m35s | 2m24s |
| Unit | merge_group | 30 | 1m31s | 2m02s |
| Unit | push (main) | 25 | 1m31s | 2m10s |

### E2E jobs (100 newest runs, 97 shard jobs each)

| Job | p50 | p95 | Failed | Real | Infra | Top failing step |
|---|---|---|---|---|---|---|
| changes | 5s | 9s | 0 | 0 | 0 | |
| e2e-shard (1) | 2m49s | 10m20s | 12 | 0 | 12 | Install Bun setup prerequisites (cancelled at job timeout) |
| e2e-shard (2) | 2m43s | 9m38s | 11 | 0 | 11 | Install Bun setup prerequisites (cancelled at job timeout) |
| e2e-shard (3) | 1m27s | 6m01s | 12 | 0 | 12 | Install Bun setup prerequisites (cancelled 5, failed 3) |
| e2e-shard (4) | 3m18s | 6m05s | 15 | 0 | 15 | Install Bun setup prerequisites (cancelled at job timeout) |
| e2e (gate) | 3s | 4s | 17 | 0 | 17 | Require every shard to pass |

"Real" is a test assertion failing in `Run e2e tests`. "Infra" is anything
else: install, network, timeout, or cancellation. Every e2e failure in the
100-run window was infra. Over the 400-run window there were 5 real shard
failures, all on one PR branch whose diff broke the page (durations of 4 to 7
minutes, many assertions failing), so no test failed intermittently at the
job level.

The `e2e` gate failed 10 times in 100 runs on `Require every shard to pass`,
and every one of those was a shard cancelled by the 12-minute job timeout
while sitting in `apt-get update`.

### E2E step breakdown (962 successful shard jobs, 400-run window)

| Step | p50 | p95 |
|---|---|---|
| Initialize containers (pull `mcr.microsoft.com/playwright:v1.60.0-noble`) | 26s | 37s |
| Check out repository | 1s | 2s |
| Install Bun setup prerequisites (`apt-get update && apt-get install unzip`) | 6s | 47s |
| Set up Node.js (toolcache hit, no download) | 1s | 4s |
| Install Bun (`setup-bun`, cache hit) | 2s | 3s |
| Cache Bun dependencies (restore, always hits on `bun.lock`) | 7s | 9s |
| Install dependencies (`bun install --frozen-lockfile`) | 5s | 8s |
| Verify Playwright browser install (image already matches) | 1s | 1s |
| Run e2e tests | 1m42s | 2m27s |
| Post Cache Bun dependencies (save only on a new `bun.lock`) | 0s | 23s |
| Whole job | 2m42s | 3m47s |
| Queue wait (created to started) | 3s | 1m26s |

So a shard is about 60s of setup and 100s of tests at p50. Caches hit: the
Bun dependency cache restored on the primary key in every sampled log, the
`setup-bun` binary cache hit, and the Playwright browser step is a no-op
because the container image ships the matching Chromium. Nothing is built
before the tests; the Playwright `webServer` starts the Bun dev server per
shard, which is inside `Run e2e tests`.

The apt step is the outlier. Its p50 is 6 seconds; its p95 is 47 seconds;
its tail is unbounded. The log of a failing instance (run 33939118472,
shard 3) shows `apt-get update` pulling about 30 MB of package indexes from
`archive.ubuntu.com` at a few KB/s for four and a half minutes and then
failing with "File has unexpected size ... Mirror sync in progress?". The
instances that "hung" were the same fetch running until the 12-minute job
timeout cancelled the job, which is why they surfaced as cancelled shards
instead of a failed step. It exists only because `oven-sh/setup-bun` needs
`unzip` to extract the Bun release on a cache miss, and the Playwright image
does not ship unzip.

### E2E shard balance

Playwright shards by test count, and a spec file goes to the shard that
contains its first test, so large files spill. The result:

| Shard | Spec files | Tests | `Run e2e tests` p50 |
|---|---|---|---|
| 1 | accessibility/*, allday/*, attendees/attendee-editor | 37 | 1m44s |
| 2 | attendees/contact-suggestions, attendees/rsvp, booking/* | 52 | 1m40s |
| 3 | calendars/*, life/*, navigation/* | 11 | 0m26s |
| 4 | oauth/*, onboarding/*, timed/* | 31 | 2m16s |

Shard 4 is the critical path at 2m16s while shard 3 finishes its tests in
26s. Total test time is about 6m06s, so an even split would be about 1m32s
per shard, roughly 45s off every e2e run. Shard 4 is slow because the
`timed/` specs drive the calendar grid with real keyboard input and the
`onboarding/` showcase specs step through many screens; shard 3 is fast
because its specs are single-page checks.

### Tests that passed only on retry

Playwright runs with `retries: 2` in CI, so an intermittent test passes the
job and appears only as "flaky" in the log. Scanning the `Run e2e tests`
logs of 705 shard jobs from the newest 200 runs:

| Test | Flaky count | Distinct branches |
|---|---|---|
| `e2e/booking/public-booking.spec.ts` › walks the picker with the keyboard via the skip link | 5 | 5 |
| `e2e/accessibility/focus-visible.spec.ts` › the 'i' shortcut moves focus to a visibly-focused sidebar day | 1 | 1 |
| `e2e/accessibility/datepicker-a11y.spec.ts` › sidebar datepicker meets baseline accessibility and contrast checks | 1 | 1 |
| `e2e/attendees/rsvp.spec.ts` › answering a single event posts immediately with scope single and no dialog | 1 | 1 |

8 flaky passes in 705 shard jobs is a 1.1% shard-level retry rate, and one
test is five of the eight. Its failure is always the same: after Enter on
the "Skip to open times" link, `expect(heading "Pick a time").toBeFocused()`
sees the heading unfocused. The test harness declares the page ready when the
h1 is visible, but the slot pane is still loading; while `slotsPending` the
picker renders a skeleton and the "Pick a time" heading does not exist, so
the skip link's click handler finds no target, returns without
`preventDefault`, and the browser performs a fragment navigation to nothing.
The heading mounts a moment later, unfocused. Under CI load the stubbed slots
request is often still pending when the test presses Tab, Enter.

### Unit jobs (100 newest runs, current layout)

| Job | p50 | p95 | Failed | Real | Infra | Top failing step |
|---|---|---|---|---|---|---|
| changes | 5s | 7s | 1 | 0 | 1 | cancelled |
| static | 47s | 1m11s | 4 | 2 | 2 | Run lint (2), cancelled (2) |
| unit-leg (core) | 22s | 27s | 1 | 1 | 0 | Run core tests |
| unit-leg (sync) | 55s | 1m22s | 1 | 0 | 1 | cancelled |
| unit-leg (backend) | 37s | 42s | 3 | 3 | 0 | Run backend tests |
| unit-leg (scripts) | 30s | 40s | 0 | 0 | 0 | |
| unit-leg (web, 1) | 1m09s | 1m17s | 3 | 2 | 1 | Run web tests |
| unit-leg (web, 2) | 1m16s | 1m24s | 3 | 1 | 2 | Run web tests |
| unit (gate) | 3s | 4s | 6 | 0 | 6 | Require every unit leg to pass |

Test steps: core 2s, scripts 11s, backend 16s, sync 34s (p95 1m01s), web 1
51s, web 2 57s. Setup per leg is about 15s (checkout, setup-bun, cache
restore, install). The web legs are the long pole by about 20s over sync;
splitting web further would save under 20s per run for another runner per
run, so it was not done.

Every real unit failure in the window recurred on the same branch across
pushes and disappeared when the branch was fixed, so none is intermittent.
Two patterns dominate the 400-run failure count and both are already
resolved or out of scope:

- `unit (web)` failed 70 times on 2026-09-04 before the leg was split in
  two; the workflow comment records this as the single-process RSS limit.
  Zero such failures after the split.
- `Install Dependencies` failed on every leg of 6 Dependabot PRs
  (`bun install --frozen-lockfile` rejects a `package.json` bump without a
  matching `bun.lock`). Those PRs cannot pass as opened. That is a Dependabot
  configuration question, not CI flakiness, and is left alone here.

### What ran on PR #3388 that its diff could not affect

The PR touched `apps/calendar-web` and `packages/core` only. Everything that ran
was reachable from that diff: e2e depends on web and core; every unit leg
depends on core. The inverse case is the waste: of the 232 PR e2e runs in
the window, 50 (22%, across 33 PRs) were on PRs whose changed files were
entirely under `packages/backend`, `packages/sync`, or `packages/scripts`
(plus docs). The e2e suite runs the web dev server in anonymous mode against
stubbed routes; `apps/calendar-web` imports only `@compass/core`, and neither
`e2e/`, `playwright.config.ts`, nor `apps/calendar-web/dev.ts` imports from those
three packages. Those 50 runs were 200 shard jobs, about 540 runner-minutes,
and 4 minutes of PR wall clock each, for no signal. The merge queue and the
push-to-main run still execute e2e for every event that is not
`pull_request`, so skipping at the PR stage loses no coverage before main
is tested.

### Answers to the audit questions

- Single most expensive step: `Install Bun setup prerequisites`. Every e2e
  gate failure in the 100-run window traces to it, including the #3388
  rerun. It also has the highest p95 of any setup step.
- Setup versus tests in e2e: about 60s setup and 100s tests per shard at
  p50. Container pull is 26s of the 60s and is not cacheable by the
  workflow. Dependency and Bun caches hit every time. Nothing is rebuilt
  four times; the dev server bundle is built inside each shard's test step
  by Playwright's `webServer`.
- Shard balance: no. Shard 4 at 2m16s versus shard 3 at 0m26s.
- Unit leg balance: acceptable. Web legs are the long pole by about 20s.
- Intermittent tests: one e2e test, the skip-link keyboard walk, at 5 of 8
  flaky passes. No intermittent unit test.
- Wasted runs: 22% of PR e2e runs were on backend-, sync-, or scripts-only
  diffs.

## Change log

Each fix records its before and after here. "After" numbers come from CI
runs on `main` once the fix lands; entries are filled in as data arrives.

### 1. Install Bun from npm inside the Playwright container

Replaces `apt-get update && apt-get install unzip` plus `oven-sh/setup-bun`
with `npm install --global bun@1.3.14`, capped at 2 minutes per step. The
npm `bun` package resolves a platform package that carries the binary, so
the shard no longer touches an Ubuntu mirror at all. `bun lint` now checks
that the version in `test-e2e.yml` equals the `bun-version` pin in
`test-unit.yml`, the same check the Dockerfiles already get.

Before: apt step p50 6s, p95 47s, unbounded tail; all 10 `e2e` gate
failures in the 100-run window came from this step (the other 7 gate
non-successes were superseded-push cancellations).

After (PR #3407, merged 2026-09-05 14:51 UTC): the replacement `Install
Bun` step took 3s to 7s on every shard of the PR run and the merge-queue
run, versus 8s for apt plus setup-bun at p50 before. Setup per shard is
unchanged at p50 and no longer has a tail. Whether the gate failure rate
drops to zero is a question for the next few hundred runs; the mechanism
that produced every one of the 10 is gone.

### 2. Skip e2e shards for backend-, sync-, and scripts-only pull requests

PR #3408, merged 2026-09-05 14:53 UTC. `detect-code-changes.sh` gains an
`e2e` output; the `e2e-shard` job gates on it. Docs-only handling, the
`e2e` gate reporting Success on a skip, `merge_group`, and `push` behavior
are unchanged.

Before: 50 of 232 PR e2e runs (22%) in the window were on PRs that could
not affect the suite. After: those PRs report `e2e` as Success in about 10
seconds (the `changes` job plus the gate) instead of about 3m30s, and use
zero shard runners.

### 3. Make the skip-link keyboard e2e test deterministic

PR #3409. `preparePublicBookingPage` waits for the "Pick a time" heading,
which renders only once slots have loaded, before returning, unless the
caller is deliberately observing the pending, failed, or unavailable state.
The flaky test's assertions are untouched.

Before: 5 retry-only passes in 705 shard jobs, 5 branches. After: to be
read from the next flaky-log scan.

### 4. Rebalance the e2e shards by measured duration

Explicit spec-directory lists per shard replace `--shard=n/4`. Sized from
the shard timings above, scaled by the local per-file ratios inside each
shard:

| Shard | Directories | Tests | Estimated `Run e2e tests` | Measured on PR #3410 |
|---|---|---|---|---|
| 1 | accessibility, allday | 32 | ~92s | 90s |
| 2 | booking, oauth | 51 | ~100s | 78s (booking alone) |
| 3 | timed | 15 | ~85s | 110s (with oauth) |
| 4 | onboarding, calendars, life, navigation, attendees | 33 | ~91s | 94s |

Before: shard 4 at 2m16s, shard 3 at 0m26s; the run's critical path was
shard 4. First measurement (PR #3410 with oauth on shard 3): slowest shard
110s, run wall clock 3m00s versus 3m32s for the merge-queue run of #3407
on the old split. `timed/` costs more per test in CI than its local ratio
suggested, so oauth moved to the booking shard before merge; expected
slowest shard about 100s. A contract test (`packages/scripts/src/testing/e2e-shards.test.ts`)
fails when an `e2e/` directory with specs is missing from every list or
appears in two, so a new directory cannot silently skip CI. Shard job names
change from `e2e-shard (1)` to `e2e-shard (1, e2e/accessibility e2e/allday)`;
the required `e2e` gate is unchanged. Measured after: see PR and the next
main runs.

## After (2026-09-05, 14:51 to 16:07 UTC)

All four fixes merged between 14:51 and 15:25 UTC (#3407, #3408, #3409,
#3410). Traffic in the window was light (10 E2E runs, 10 Unit runs), so
these are early readings, not statistics. The fix-1 mechanism is gone
regardless of sample size; the rest should be re-read after a few hundred
runs.

### Required checks, before and after

| Check | Before p50 | Before p95 | After p50 | After p95 | n after |
|---|---|---|---|---|---|
| `static` (job) | 47s | 1m11s | 46s | 51s | 8 |
| `unit` (run wall clock, PR) | 1m35s | 2m24s | 1m32s | 1m32s | 2 |
| `e2e` (run wall clock, PR) | 3m32s | 9m05s | 3m00s | 3m21s | 4 |
| `e2e` on the new shard split (fix 4, any event) | 3m32s | | 2m46s | 2m49s | 2 |

E2E rerun rate: 1 in 100 before, 0 in 10 after. E2E gate failures: 10 in
100 before (all apt), 0 in 10 after. `static` failed twice in the window,
both on PR #3410 itself (actionlint on the new run step, fixed before merge).

### E2E shard steps after fix 1 (40 shard jobs)

| Step | Before p50 | Before p95 | After p50 | After p95 | After max |
|---|---|---|---|---|---|
| Install Bun setup prerequisites (apt) | 6s | 47s | removed | | |
| Install Bun (setup-bun before, npm after) | 2s | 3s | 5s | 7s | 7s |
| Initialize containers | 26s | 37s | 26s | 37s | 40s |
| Cache Bun dependencies | 7s | 9s | 7s | 10s | 10s |
| Install dependencies | 5s | 8s | 4s | 6s | 6s |

Setup per shard is about 45s to 60s either way at p50; the difference is
that nothing in it can hang any more.

### E2E shard balance after fix 4 (2 runs)

| Shard | Directories | `Run e2e tests` |
|---|---|---|
| 1 | accessibility, allday | 99s, 103s |
| 2 | booking, oauth | 80s, 85s |
| 3 | timed | 88s, 103s |
| 4 | onboarding, calendars, life, navigation, attendees | 84s, 97s |

Before: 104s / 100s / 26s / 136s. The slowest shard went from 136s to
103s, and the run wall clock from 3m32s (PR p50) to 2m44s and 2m49s.

### Retry-only passes after fixes 1 and 3 (40 shard jobs)

One: `e2e/attendees/attendee-editor.spec.ts` › adding a guest on one
occurrence of a series saves the whole series (1 of 40). The skip-link
walk that was 5 of 8 before did not need a retry in any of the 10 runs.
The attendee test is a new entry; one occurrence is not yet a pattern.

### Tests deleted

None. The measured test steps are small (unit legs 2s to 57s of tests,
e2e shards about 90s each after rebalancing), and every failure in the
window was infrastructure or a real regression on the PR that failed. No
test met the bar of "assert only a mock was called, duplicate another
layer, or exercise nothing a user can hit" strongly enough to be worth
removing coverage for a saving measured in seconds. The candidates worth a
look if someone wants to go further are the 24 axe scans in
`e2e/accessibility/booking-a11y.spec.ts` (about 85s of shard time); they
were kept because each covers a distinct page state.

## Looked at, not changed

- Playwright `retries: 2` in CI. It hides intermittent tests from the job
  result, which is why the flaky table above had to come from logs. Dropping
  it would turn a 1.1% shard retry rate into red runs; fix the tests first.
- Playwright container pull, 26s per shard. A pinned image is the right call
  for browser reproducibility; the alternative (host runner plus
  `playwright install --with-deps`) reintroduces apt.
- `static` runs `actionlint` through `docker run`, 3s. Fine.
- Dependabot PRs that fail `bun install --frozen-lockfile`. Not flakiness;
  a configuration question for whoever owns Dependabot.
- The "Pick a time" heading is deliberately absent while slots load (two
  web tests assert it). A keyboard user who activates "Skip to open times"
  during that window gets nothing. The e2e harness fix removes the flake;
  the product behavior is unchanged and noted here for a UX pass.
- Unit web legs: a third leg would shave under 20s. Not worth a runner.

## After (2026-09-07): reliability follow-up

Required Unit and E2E checks were already green. The remaining pain was a
permanently red Performance budget on `main` (desktop script transfer
1,034,338 bytes vs a 1,000,000 budget since 2026-09-04) and Agent loop /
Agent review skip-flooding the Actions tab (~147 Agent loop runs in 24h
vs ~49 Unit). Follow-up:

1. Recalibrate desktop `scriptBytes` to 1,060,000 from the 2026-09-07
   main actual, still under the ~170 KB editor-stack tripwire.
2. Agent loop `pull_request` types are now `labeled` / `unlabeled` /
   `closed` only; cron is hourly instead of `*/15`.
3. Agent review no longer runs on `synchronize`.
4. Unit legs skip packages the PR did not touch, with
   `detect-code-changes.sh` emitting `core` / `web` / `backend` / `sync`
   / `scripts`. Merge queue and `main` still run every leg.
5. Leftover GitHub workflow records for deleted `e2e.yml` and
   `pr-body.yml` are disabled so `gh run list --workflow=E2E` is unique.
