# Performance Baselines

Illustrative test-suite timings from the native-parallel test runner
migration. The Google-import benchmark and `event.repository.ts` query-plan
gate this doc originally recorded were retired along with the legacy
in-backend sync engine they measured (see [Google Sync And SSE Flow](../features/google-sync-and-sse-flow.md)
for the current architecture) — Sync (`packages/sync`) owns import
performance now, with its own test suite.

Web paint and script-transfer numbers come from GitHub Actions
[`.github/workflows/perf-budget.yml`](../../.github/workflows/perf-budget.yml)
(`lighthouse` job), not from this table. That workflow builds `packages/web`,
serves the gzipped bundle the way production Caddy does, and asserts medians
from two Lighthouse profiles (desktop is the blocking gate; mobile is
warn-only). Budgets and the calibration rule live in
[`.github/perf/assert-budget.ts`](../../.github/perf/assert-budget.ts):
read actuals off a green `main` run, never a laptop.

The job is **not** a required merge check. It runs on:

- `push` to `main` when `packages/web/**`, `packages/core/**`, `bun.lock`,
  `.github/perf/**`, or the workflow file change
- a nightly `schedule` (`15 5 * * *` UTC)
- `workflow_dispatch`
- pull requests that touch `.github/perf/**` or
  `.github/workflows/perf-budget.yml`

A PR that only changes `packages/web/src/**` does not start a `lighthouse`
check. List recent runs with `gh run list --workflow=perf-budget.yml`.

## Native parallel test suite timings (Bun 1.3.14)

Recorded on 2026-08-12 on the cloud agent VM after launch-hardening work
(stale create retry, provider-write ladder extract, USER collection cleanup,
SSE `waitForNoEvent`). Use `bun test:sync:fast` / `bun test:backend:fast` for
Mongo-free iteration; full suites remain the durability gate.

| Script | Tests | Time |
| --- | --- | --- |
| `bun run test:core` | (see package) | ~0.5s |
| `bun run test:web` | (sequential; see testing-playbook) | ~14–17s |
| `bun run test:backend:fast` | 248 / 248 | ~1.6s |
| `bun run test:backend` | 303 / 304 (1 skip) | ~3.4s |
| `bun run test:sync:fast` | 321 / 321 | ~0.6s |
| `bun run test:sync` | 893 / 893 | ~13–14s |
| `bun run test:scripts` | (see package) | ~2s |

## Web boot-set size (`bun run build:web`)

`packages/web/build.ts` prints a boot-set report from the production metafile
after each `bun run build:web`. The boot set is the same graph
`inject-module-preloads.ts` preloads: the entry chunk, its `app.bootstrap`
dynamic import, the `AppRoot` and `RootShell` chunks, and every static-import
closure of those roots.

Read the report as:

- **chunks**: JavaScript files on that graph, including the entry. A new
  `import()` root that stays on the boot path raises this count. #3704 is
  the precedent for not trading bytes for extra requests.
- **raw / gzip**: decoded and gzipped bytes of those files. gzip is the
  transfer-shaped number; raw is what the parser sees. Each chunk is gzipped
  separately and the sizes are summed, matching one HTTP response per file.
- **Top packages**: minified `bytesInOutput` attributed by the last
  `node_modules/` path segment (Bun's isolated linker layout). First-party
  sources are omitted. Zod's `v4/locales` share is noted when present.

Ceilings live in `packages/web/boot-size-budget.json`: per-package minified
bytes, total gzip, and chunk count. The build exits non-zero when any of
those is exceeded, and the message names the package (or gzip/chunks) and
the delta. Headroom is 5% above the WP-13 measurement so later boot-weight
work can land without the gate failing first.

**Lower a ceiling when you remove that weight from the boot path** (the
acceptance for WP-14, WP-15, and WP-16). Run `bun run build:web`, copy the
new actual into the JSON, and keep a little headroom only if the number
still jitters across machines. Do not raise a ceiling to make a
regression pass; fix the import or the split instead. When a new npm
package appears on the boot path, add a ceiling for it in the same change.
When a package leaves the boot path, delete its key so the file only
lists what boot still loads.

The CI `perf-budget` Lighthouse job remains the transfer gate on ubuntu and
is calibrated from CI, never from a laptop. This report is the local,
per-package tool that job cannot be.

## Regression rule

Investigate any p95 query or render regression over 20% from the numbers
recorded above. Re-run the affected suite, compare against this file, and
update the recorded numbers alongside the change once investigated.
