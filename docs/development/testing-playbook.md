# Testing Playbook

Use the smallest test surface that can fail for the change you are making, then widen only if the change crosses boundaries.

## Main Commands

From repo root:

```bash
bun run test:core
bun run test:sync
bun run test:web
bun run test:backend
bun run test:scripts
bun run type-check
bun run verify
```

Avoid defaulting to `bun run test` unless you really need the full suite.

`bun run verify` selects the **required-check subset** from the merge-base vs
`origin/main` plus the working tree: `test:<pkg>` (or `test:<pkg>:fast` when
the package has a fast script and the diff has no `*.db.test.ts` and no
`/storage/` or `/repositories/` paths) for each detected package, plus
`type-check`, `lint`, and `knip`. Those independent checks run concurrently.
Web or `e2e/` changes also select `test:a11y` and `test:e2e` after that wave.
Pass `--serial` to run checks one after another. The last line is always
`VERDICT: PASS`, `VERDICT: INCOMPLETE`, or `VERDICT: FAIL`. `INCOMPLETE`
means every selected check passed but a Playwright check was skipped (no
Chromium; install with `bunx playwright install chromium`), so CI parity is
not proven. It exits 0 by default so you can iterate; pass `--strict` before
labeling a PR so `INCOMPLETE` exits 1.
GitHub still runs the Unit workflow matrix and the E2E workflow on every
non-docs PR; this helper does not.

## CI Unit Test Workflow

Source of truth:

- `.github/workflows/test-unit.yml` (workflow name: `Unit`)
- `.github/workflows/test-e2e.yml` (workflow name: `E2E`)

Unit workflow (`test-unit.yml`):

- triggers on `pull_request` to `main`, `merge_group`, and `push` to `main`
- uses `concurrency` so a new PR push cancels the previous PR run
- runs one `static` job (lint, knip, type-check as separate steps)
- runs a matrix across `core`, `sync`, `web, 1`, `web, 2`, `backend`, and `scripts`
- uses `fail-fast: false`, so one failing lane does not cancel the others
- runs `bun run test:<project>` in each lane after dependency install
- runs `unit (web, 1)` and `unit (web, 2)` with `WEB_TEST_SHARDS=4` and
  `WEB_TEST_SHARD_INDEX` `1,2` / `3,4` so each leg is two sequential
  RSS-safe processes covering half the suite
- runs every lane with `TZ: Etc/UTC` set
- does not install Node on Bun-only jobs
- `bun run lint` runs `check-semantic-colors.ts`, `check-agent-constraints.ts`
  (barrels, web-test locators, backend/sync `mongoService` imports, duplicate
  `EventSchema`, Bun pins, Zod import path, em-dashes in web strings, raw
  keydown listeners), and Biome with `--error-on-warnings`. All three run
  even when an earlier one fails, so one run reports every class of error.
  Every constraint hit prints how to fix it and which allowlist documents
  exceptions.
- `bun run type-check` includes core/backend/sync/scripts tests via
  `tsconfig.tests.json` referenced from `tsconfig.typecheck.json`.

Local parity commands:

```bash
bun run test:core
bun run test:sync
bun run test:web
bun run test:backend
bun run test:scripts
```

E2E workflow (`test-e2e.yml`) is separate and runs on pull requests, merge-queue `merge_group` events, and pushes to `main` via `bun run test:e2e`.

## Current Test Strategy

Every package runs on Bun's native test runner (Bun 1.3.14+); Jest has been removed.

- `bun run test:core` — `test-parallel.ts core`: `bun test --parallel` with `core.preload.ts`.
- `bun run test:web` — `test-parallel.ts web`: sequential `bun test` processes with `web.preload.ts` (jsdom, MSW, Zustand reset, injectable test seams). Files run sequentially inside each process — not `--parallel` — because MSW/jsdom globals do not survive Bun's per-file `--isolate`. Default local behavior is four sequential shards (`WEB_TEST_SHARDS`). Set `WEB_TEST_SHARD_INDEX` to run only one shard (CI uses two shards as `unit (web, 1)` and `unit (web, 2)`). See [Web native parallel (future / blocked)](#web-native-parallel-future--blocked).
- `bun run test:backend`, `bun run test:scripts`, and `bun run test:sync` — `test-mongo-env.ts` boots one shared in-memory Mongo replica set, then runs `bun test --parallel` with the package preload. Per-file DB names come from `setupTestDb(import.meta.url)`.
- `bun run test:backend:fast`, `bun run test:sync:fast`, and `bun run test:scripts:fast` — `test-parallel.ts` with mongo-free preloads; excludes `*.db.test.*` via `--path-ignore-patterns`. No mongod boot — use these for day-to-day backend/sync/scripts work that does not touch persistence.
- Backend and web SuperTokens, toast, and Google-auth behavior in tests use injectable seams (`TestGcalFixture`, `session.middleware`, `supertokens.registry`, `session.port`, `emailpassword.port`, `toast.port`, `useStartGoogleAuthorization.registry`, `useCompleteAuthentication.registry`, `LoggerFactory`) instead of preload `mock.module` clusters.
- Test files import lifecycle/assertion APIs from `bun:test` only (`mock`, `spyOn`, `mock.module` where unavoidable).

### Known infrastructure constraints

**Web test seams.** Session, toast, Google authorization, email/password, and complete-authentication use injectable ports/registries registered in `@web/__tests__/helpers/web-test-seams.ts`. The preload lifecycle calls `installDefaultWebTestSeams()` in `beforeEach` and `resetWebTestSeams()` in `afterEach`, so web no longer needs preload `mock.module` clusters or a per-file process launcher.

**Web sequential runner.** Web runs sequential Bun processes (shards) with files executed sequentially inside each process. Native `--parallel` is intentionally disabled — see [Web native parallel (future / blocked)](#web-native-parallel-future--blocked) below. Core/backend still use `--parallel`. `WEB_TEST_SHARD_INDEX` selects one shard; unset, `bun test:web` still runs every shard.

**IndexedDB in tests.** `ensureIndexedDbTestEnv()` re-applies fake-indexeddb globals when needed.

**Store reset registry.** Zustand stores are module singletons. `@web/__tests__/utils/state/reset-stores.ts` registers every store that must reset between tests; `web.preload.ts` calls `resetAllStores()` in a global `afterEach`. When adding a new store, register it in both `reset-stores.ts` and `seed-stores.ts` or state will leak silently across tests.

**Fast vs full mongo tiers.** Files named `*.db.test.ts(x)` connect to the shared in-memory replica set started by `test-mongo-env.ts`. Everything else is "fast" and can run without mongod via the `:fast` scripts. Full-suite commands (`test:backend`, etc.) still boot mongod because some non-db tests import backend modules that expect `MONGO_URI` to be set even when they do not connect.

**Web preload modules.** Setup lives under `packages/web/src/__tests__/setup/` (jsdom env, browser polyfills, asset stubs, indexedDB, test lifecycle). The entry point is `web.preload.ts`, which loads setup side effects then dynamically imports the lifecycle module.

### Web native parallel (future / blocked)

Investigation target: enable `bun test --parallel` for `packages/web` without per-file process isolation (the old `test-isolated.ts` launcher spawned one Bun process per file).

#### Current runner

`test-parallel.ts web` runs:

```bash
bun test --preload packages/web/src/__tests__/web.preload.ts ./packages/web/src
```

No `--parallel` flag. One process, files run sequentially. Typical wall time on Bun 1.3.14: **~15–17s** for ~1,319 tests across ~203 files (see `docs/development/performance-baselines.md`).

Launcher gate: `packages/scripts/src/testing/test-parallel.ts` sets `parallelFlag = []` for the `web` profile.

#### Bun CLI constraints (Bun 1.3.14)

| Flag | Behavior | Viable for web? |
| --- | --- | --- |
| `--parallel[=N]` | Spawns N worker processes; **always implies `--isolate`**. | Blocked (see below). |
| `--isolate` | Resets `globalThis` between test **files** within a process/worker. Preload modules stay loaded. | Same breakage as `--parallel`. |
| `--concurrent` | Runs individual tests concurrently in one process (`test.concurrent()` semantics). | **No** — shared jsdom `document`, MSW server, and module singletons race; ~465 failures in a full-suite experiment. |
| `--max-concurrency` | Caps concurrent tests when using `--concurrent`. | Does not help without `--concurrent`. |
| `--shard=i/n` | Splits files across CI jobs **without** requiring `--parallel`. | Works today for CI scaling (multiple jobs, each sequential). |

There is **no Bun flag** for multi-process file parallelism without per-file global isolation.

#### Root cause: preload lifetime vs `--isolate`

Web tests depend on a shared preload stack:

1. **jsdom** — one `JSDOM` instance mirrored onto `globalThis` (`jsdom-env.ts`, `browser-polyfills.ts`).
2. **MSW** — `setupServer(...)` singleton; `server.listen()` in global `beforeAll` (`test-lifecycle.ts`).
3. **Module singletons** — Zustand stores, repository-source cache, axios adapter overrides.

Under `--parallel` / `--isolate`, Bun clears globals between files in a worker but **does not reload preload modules**. That mismatch causes two failure modes:

**MSW XHR patching.** MSW v1 (`msw@1.3.x`) uses `@mswjs/interceptors`'s `XMLHttpRequestInterceptor`. On `setup()`, it captures `const PureXMLHttpRequest = window.XMLHttpRequest`, patches the constructor, and registers teardown that restores `window.XMLHttpRequest = PureXMLHttpRequest`. After `--isolate` resets globals, the interceptor module still holds the **previous** `PureXMLHttpRequest` reference (often `undefined`). The next file's requests hit a broken patch — historically surfaced as `oldXMLHttpRequest is undefined` / `PureXMLHttpRequest is undefined` in CI. `BaseApi` uses `fetch`, but SuperTokens, axios browser adapters, and some hooks still exercise XHR in jsdom.

**Other globals (partially mitigated).** IndexedDB globals were cleared the same way; `ensureIndexedDbTestEnv()` re-mirrors when `globalThis.indexedDB` is missing (`indexeddb-env.ts`). No equivalent re-patch exists yet for MSW/jsdom XHR.

#### What #2307 fixed (prerequisites for parallel)

PR #2307 removed blockers that required the old per-file launcher and briefly enabled `bun test --parallel` for web:

- **Injectable test seams** — session (`session.port`), toast (`toast.port`), Google auth (`useStartGoogleAuthorization.registry`), email/password (`emailpassword.port`), and complete-auth (`useCompleteAuthentication.registry`) replace preload `mock.module` clusters. Reset via `installDefaultWebTestSeams()` / `resetWebTestSeams()` in global hooks.
- **Setup module split** — `packages/web/src/__tests__/setup/` (jsdom, polyfills, indexedDB, lifecycle).
- **Store reset registry** — `resetAllStores()` in global `afterEach`; `BaseApi.defaults.adapter` cleared each test.
- **IndexedDB re-mirror** — survives one class of `--isolate` global clears.

These changes reduced cross-file mock leakage and made a single-process runner viable, but they do **not** fully reconcile MSW's XHR interceptor with `--isolate`. Commit `246078c3c` (same PR arc, post-merge) disabled `--parallel` for web again and restored sequential execution (~15s) after MSW/isolate breakage in CI.

#### What was tried and reverted — do not reintroduce

**Session provider reset in `afterEach`.** Added `resetSessionProviderForTests()` in `SessionProvider.tsx` (unsubscribe `session.onAnyEvent`, reset init flags, clear auth store) and wired it through `reset-stores.ts` for parallel workers. **Reverted** in `246078c3c` because it **poisoned MSW** — session/SSE teardown interfered with XHR interception stability. Session isolation must stay on injectable ports (`resetSessionApiPort()`), not tearing down `SessionProvider` module singletons.

#### Parallel experiments (Bun 1.3.14, compass-calendar branch)

Manual runs of the full web suite with `--parallel=4`:

- **Correctness:** Often green (~1,319/1,319 pass) on a clean run, but historically flaky under CI file ordering — intermittent timeouts, module export `SyntaxError`s between files (e.g. missing named exports after isolate), and the MSW XHR failure above. Sequential runs show similar occasional flakes; parallel adds isolate-induced failure modes on top.
- **Performance:** **Slower wall clock** than sequential despite higher CPU — ~25–30s vs ~15–17s. Each worker pays preload + jsdom + MSW startup; web tests are setup/DOM-bound, not CPU-bound.
- **`--concurrent`:** Catastrophic (~465 failures, ~45 errors). Not a substitute.

Conclusion: even if MSW/isolate were fixed, `--parallel` may not improve local/CI wall time for this suite. The durable win from #2307 was seam-based isolation and removing the per-file launcher; Bun worker `--parallel` was tried in #2307 and disabled again in `246078c3c` due to MSW/isolate breakage.

#### Paths forward (not implemented)

1. **Re-initialize MSW per file under isolate** — detect stale XHR patch (e.g. missing/unpatched `window.XMLHttpRequest`) in `beforeAll` and call `server.close()` + fresh `setupServer().listen()`, mirroring the indexedDB re-mirror pattern. Needs careful ordering with SuperTokens/PostHog import order (`CompassProvider.tsx`).
2. **Fetch-only MSW path** — route all test HTTP through `fetch` interceptors and disable XHR patching if MSW v2+ supports it cleanly in jsdom.
3. **Upgrade MSW** — v2 uses a different interceptor stack; evaluate whether it survives `--isolate` better (migration cost: handler API, strict-mode wiring).
4. **CI sharding without `--parallel`** — `bun test --shard=1/3` across matrix jobs gives parallelism at the CI level with sequential globals per job (no `--isolate` breakage).
5. **Split pure unit files** — a future `web-fast` profile could `--parallel` only `.test.ts` files that never import jsdom/MSW (subset of ~125 files); component `.test.tsx` files stay sequential.
6. **Bun upstream** — option for `--parallel` without `--isolate`, or isolate that re-runs preload between files.

#### Acceptance check

Until a path above lands, **`bun run test:web` stays sequential**. Do not enable `--parallel` in `test-parallel.ts web` without a green full-suite run under `--parallel` in CI (multiple shards if needed) and a wall-time justification.

### Test file naming and tiers

Mongo-backed tests use the `*.db.test.ts` / `*.db.test.tsx` suffix. Everything else is "fast".

- `bun run test:backend` / `bun run test:scripts` / `bun run test:sync` — full package suite.
- `bun run test:backend:fast` / `bun run test:scripts:fast` / `bun run test:sync:fast` — excludes `*.db.test.*` and skips mongod boot (parallel, mongo-free preloads).
- `bun run test:backend:db` / `bun run test:scripts:db` — only `*.db.test.*` files.
- Focus a run: `bun packages/scripts/src/testing/test-mongo-env.ts backend -- ./packages/backend/src/user/controllers/user.controller.db.test.ts`.

## What To Run By Change Type

### Shared type or schema change

Run:

```bash
bun run test:core && bun run test:web && bun run test:backend
bun run type-check
```

### Web-only UI or behavior change

Run:

```bash
bun run test:web
```

Add `bun run test:core` if the change touched shared utilities.

### Backend route or service change

Run:

```bash
bun run test:backend
```

Add `bun run test:core` if a shared type or mapper changed.

### CLI or migration change

Run:

```bash
bun run test:scripts
```

## Web Test Style

Preferred style:

- React Testing Library
- semantic queries by role/name/text
- `user-event` for real interactions

Avoid:

- CSS selectors
- implementation-detail assertions
- unnecessary module-wide mocks

Isolation rules:

- Prefer provider wrappers, real stores, explicit dependency factories, or `spyOn` with teardown over top-level `mock.module`. Module mocks remain process-wide within their test file and can affect every later import in that file.
- Avoid mocking shared UI primitives such as `TooltipWrapper`, `@floating-ui/react`, or session hooks in broad component tests. Even with per-file isolation, broad mocks can hide integration behavior inside that file.
- If a test replaces globals (`fetch`, `document.getElementById`, storage, timers, console methods), restore the original value in teardown.
- Prefer `renderWithStore`, `createStoreWrapper`, or a focused provider harness over mocking `@web/store` or `store.hooks`.
- `bun run test:web` is the acceptance check for the web suite. It runs the full package sequentially in one process (not `--parallel`); see [Web native parallel (future / blocked)](#web-native-parallel-future--blocked). A focused single-file run can still miss cross-file interactions.
- `mock.module` is process-global within a test file, not test-scoped. Prefer injectable seams (`session.port`, `toast.port`, `emailpassword.port`, hook registries) or `spyOn` with teardown. File-level `mock.module` remains acceptable for one-off module substitution when a seam does not exist yet.
- **Never mock `@tanstack/react-router` hooks without restoring them.** Bun's web suite runs all files in one process and discovery order is non-deterministic. Gate every overridden hook (`useNavigate`, `useSearch`, `useLocation`, `useParams`, …) behind a flag flipped off in `afterAll`, delegating to the snapshotted real implementation when the flag is false — see `SelectView.test.tsx`, `CommandPalette.test.tsx`, and `LifeView.test.tsx`. An unconditional `useSearch: () => ({})` will leave AuthModal (URL-driven via `?auth=`) unable to open for every later file in the process. Do not force alphabetical web file order as a workaround: that order trips a separate SuperTokens/posthog XMLHttpRequest conflict.
- To focus an element on mount in this jsdom setup, use React's `autoFocus` prop or a stable callback ref (`ref={useCallback(n => n?.focus(), [])}`) — both fire in the commit phase. A `useEffect(() => ref.current?.focus())` does **not** make the element `document.activeElement` in tests. `autoFocus` trips biome's `lint/a11y/noAutofocus` (error) and a JSX-attribute `biome-ignore` comment breaks the formatter, so prefer the callback ref.
- `FloatingFocusManager` fights virtual-focus combobox palettes: for a component that keeps real focus in one input while using `useListNavigation({ virtual: true })` + `aria-activedescendant` (a command-palette style pattern), `FloatingFocusManager` asynchronously grabs focus to the panel container and steals it back from the input. Drop it — `useDismiss` still handles Escape/outside-press without it. It belongs on anchored forms with a real reference element instead (e.g. `FloatingEventForm`).

### Web test harness (MSW + globals)

Primary setup files:

- `packages/web/src/__tests__/web.preload.ts` (orchestrator)
- `packages/web/src/__tests__/web.test.init.ts` (API base URL, Google client id)
- `packages/web/src/__tests__/helpers/web-test-seams.ts` (default session/toast/Google-auth test ports; helpers for emailpassword + complete-auth registration)
- `packages/web/src/__tests__/__mocks__/server/mock.handlers.ts`

Current defaults worth knowing:

- MSW runs in strict mode: `server.listen({ onUnhandledRequest: "error" })`
- unhandled HTTP requests fail the test (instead of silently passing)
- IndexedDB is provided by `fake-indexeddb/auto`
- `structuredClone` is polyfilled for test environments that do not provide it
- SuperTokens session existence defaults to `true` via `installDefaultWebTestSeams()` in `beforeEach`

Important built-in handlers include:

- `GET http://localhost/version.json` (used by `useVersionCheck`)
- event and user profile/metadata routes under `ENV_WEB.API_BASEURL`
- `POST /session/refresh` with both token headers and token cookies

When a component/hook introduces a new request, add a handler in the test (or shared handlers) rather than disabling strict mode.

Example per-test override:

```tsx
import { rest } from "msw";
import { server } from "@web/__tests__/__mocks__/server/mock.server";

server.use(
  rest.get("http://localhost/version.json", (_req, res, ctx) => {
    return res(ctx.json({ version: "1.2.3" }));
  }),
);
```

### Warning-Free React Updates

When a test drives React state updates outside simple one-off interactions, wrap the update sequence in `act` imported from `react`.

```tsx
import { act } from "react";
```

Use this pattern for:

- grouped `user-event` interactions that trigger multiple updates
- manual callback triggers (for example `matchMedia` change handlers)
- awaiting async values returned from spies before asserting final UI state

Example:

```tsx
await act(async () => {
  await user.type(screen.getByLabelText(/email/i), "invalid");
  await user.tab();
});
```

### Testing Responsive Layout State (`useResponsiveLayout`)

Files:

- `packages/web/src/components/AuthenticatedLayout/useResponsiveLayout.ts`
- `packages/web/src/components/Sidebar/ShortcutsOverlay/ShortcutsOverlay.tsx`
- `packages/web/src/views/Day/view/DayViewContent.tsx`

Reliable setup pattern:

- mock `window.matchMedia` with `addEventListener`/`removeEventListener` support (mount state comes from the mocked `matches`, breakpoint crossings from `change` events)
- expose a small test helper to trigger media-query changes and wrap the trigger in `act`
- assert against the view store (`selectIsSidebarOpen(useViewStore.getState())`) — the hook writes to the store rather than returning state

Assertions to prefer:

- query the sidebar by landmark role and label (`role="complementary"`, `name: "Shortcuts sidebar"`)
- when asserting presence in JSDOM for desktop-only markup (`hidden xl:flex`), use role queries that allow hidden elements where needed
- verify both pathways for toggle behavior:
  - user interaction (header toggle button)
  - keyboard interaction (`]` shortcut via global shell shortcuts)

### Seeding Event Data And Client State

Persisted events live in TanStack Query; transient client state lives in
per-domain Zustand stores (see
[Frontend Runtime Flow](../frontend/frontend-runtime-flow.md#state-systems)).
Seed both explicitly rather than reaching into module internals:

- The render harnesses (`mock.render.tsx`'s `render`/`renderHook`, and
  `render-with-store.tsx`'s `createStoreWrapper`/`renderWithStore`) take an `events` option that calls
  `seedEventQueries(queryClient, events)`
  (`@web/__tests__/utils/event-query-test-data.ts`).
- They take a `state` option (shape mirrors the old Redux `RootState`:
  `{ events: { draft }, view, settings, userMetadata }`), routed through
  `seedStoresFromState()` (`@web/__tests__/utils/state/seed-stores.ts`) into
  the real Zustand stores.
- Zustand stores are module singletons; isolation comes from
  `resetAllStores()`, registered in a global `afterEach` in `web.preload.ts`.
  A new store must be added to both the reset registry
  (`@web/__tests__/utils/state/reset-stores.ts`) and the seeder, or it leaks
  state across tests silently.

A gotcha that produces confusing failures far from its actual cause:

- **Pending-mutation seeding:** a pending event is derived from an in-flight
  mutation whose `mutationKey` is a full 3-segment
  `eventMutationKeys.operation("edit" | "create" | ...)`. A bare
  `["events", "mutation"]` key is not recognized. Convert payloads nest the
  id under `variables.event._id`; a reorder mutation marks no events pending
  by design.

### Route-Aware Component Tests

For components that depend on routing context (`Outlet`, nested routes, route transitions), prefer the shared memory-router helper:

- `packages/web/src/__tests__/utils/providers/createTestRouter.tsx`

Pass `initialEntries` when asserting nested or non-root routes.

### Global And Console Cleanup

If a test overrides globals (for example `window.location` or `window.indexedDB`) or spies on `console.*`, always restore them in teardown (`afterEach`/`afterAll`) to prevent cross-test leakage and noisy output.

### Floating UI-dependent tests

Web tests exercise `@floating-ui/react` components on production code paths in jsdom. No separate floating-ui setup file is required — the jsdom polyfills in `packages/web/src/__tests__/setup/` provide enough layout stubs. See the FloatingFocusManager note under isolation rules above when testing combobox/command-palette patterns.

### Unbound method assertions in tests

If you need to assert method calls on non-mock objects, spy on the method first (`spyOn(...)` from `bun:test`) so the assertion is bound to a real mock/spy rather than an unbound method reference.

Useful anchors:

- `packages/web/src/__tests__`
- `packages/web/src/views/**/*.test.tsx`
- `packages/web/src/sse/**/*.test.tsx`

## Backend Test Style

Preferred style:

- controller/service behavior tests
- realistic request flows when possible
- mock only external services, not internal business logic

**Do not import `mongoService` (or other persistence implementations) directly in tests.** Use test drivers instead (e.g. `UserDriver`, `GoogleWatchDriver` in `packages/backend/src/__tests__/drivers/`). Drivers encapsulate persistence so that switching away from Mongo (or another store) in the future does not require changing test code.

CI runs every lane with `TZ: Etc/UTC` (see CI Unit Test Workflow above). The launcher already sets `TZ=Etc/UTC` for each test process, so a backend test that only fails locally is rarely a timezone issue; to reproduce CI exactly, run `bun run test:backend`.

Useful anchors:

- `packages/backend/src/__tests__`
- `packages/backend/src/__tests__/drivers/`
- `packages/backend/src/event/services/*.test.ts`
- `packages/backend/src/sync/**/*.test.ts`

## Core Test Style

Preferred style:

- pure function coverage
- edge cases and schema validation
- date and recurrence invariants

Useful anchors:

- `packages/core/src/util/**/*.test.ts`
- `packages/core/src/types/*.test.ts`
- `packages/core/src/validators/*.test.ts`

## E2E Notes

E2E tests live in `e2e`.

Use them for:

- critical user flows
- integration between auth, UI, and persistence
- regressions that unit tests cannot model cleanly

### Accessibility Testing

Compass targets WCAG 2.2 Level AA. Use native HTML first and the WAI-ARIA
Authoring Practices Guide when a complex widget needs ARIA roles, states, or
keyboard behavior. ARIA is implementation guidance, not a substitute for
meeting WCAG or testing the resulting experience.

Accessibility coverage is layered because no single tool can establish WCAG
conformance:

| Layer | What it protects | When it runs |
| --- | --- | --- |
| Biome accessibility rules | Invalid or risky JSX and ARIA patterns | Editor, `bun run lint`, and CI |
| React Testing Library | Roles, accessible names, state, focus, and keyboard behavior | Focused web tests and `bun run test:web` |
| Playwright with axe | Automatically detectable issues in realistic rendered states | `bun run test:a11y`, `bun run verify web`, and E2E CI |
| Targeted browser assertions | Regressions generic rules cannot reliably model, such as transient contrast or focus behavior | The relevant E2E regression test |
| Daily staging use and periodic audits | Broad usability regressions and judgment-based WCAG criteria | Once-daily normal use and separately scoped audits, never per-PR checklists |

#### How Axe Coverage Works

`AxeBuilder.analyze()` scans the rendered DOM once, in its current state. With
no `include`, it scans the page. An `include` limits the scan to that region.
It does not observe later changes or automatically discover closed dialogs,
collapsed menus, alternate routes, hover/focus styles, or validation states.
Reveal or activate those states before scanning them.

Do not add a bespoke axe test for every component or automatically scan the
arbitrary final state of every E2E test. Instead, keep a small accessibility
smoke suite covering representative pages and important states. Add a new
checkpoint when a change introduces:

- a major route or substantially different page layout
- a dialog, menu, popover, disclosure, or other initially hidden region
- a form validation or error state
- a complex widget with custom keyboard or ARIA behavior
- a UI state not already rendered by an existing accessibility test

Use one shared assertion helper for the standard axe configuration and failure
formatting. A checkpoint should normally scan the whole page. Limit the scan to
a region only when the test intentionally owns that region and document why.
Treat `violations` as failures and review `incomplete` results: incomplete means
axe could not make a reliable automated decision and requires human judgment.

#### Shared Helper

`e2e/utils/axe-assertion.ts` exports `expectNoAxeViolations(page, options?)`.
It runs one `AxeBuilder` scan tagged to Compass's WCAG target
(`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` - the full WCAG 2.2 AA
set; WCAG 2.2 only added AA-level success criteria, so there is no `wcag22a`
tag). That tag set was confirmed against the installed axe-core version, not
assumed:

```bash
grep -o 'wcag2[0-9a]*' node_modules/axe-core/axe.js | sort -u
```

Re-run that after bumping axe-core to confirm the tags are still current.

Options:

- `include`: CSS selector to scope the scan to a region (omit for whole-page).
- `checkpoint`: short label included in failure/log output.
- `knownIncomplete`: an array of `{ ruleId, reason }`. Any `incomplete` result
  whose rule id is listed here is reported as an explained, expected result
  for that checkpoint. This is not a blanket allowlist - it does nothing for
  other rules or other checkpoints. Everything in `incomplete` that isn't
  listed is still printed (never silently dropped), just not failed.

**Incomplete-result policy:** `violations` always fail the test. `incomplete`
never fails the test - axe itself couldn't decide, so treating it as a hard
failure would make the suite fail on things no one can fix from the report
alone. Every incomplete result is printed for review, either as "known" (with
its documented reason) or as an unexplained result to look at. The two
`knownIncomplete` entries in use today (both on the actions-menu checkpoint,
see `e2e/accessibility/app-a11y.spec.ts`) are `aria-valid-attr-value` and
`aria-hidden-focus`, both inherent to how `@floating-ui/react` portals menu
content and traps focus around it, not app markup - see the reasons recorded
at the call site. Unexplained `incomplete` results seen in this suite today
are `color-contrast` (axe cannot compute a background across an
absolutely-positioned overlap or a CSS gradient, and cannot reliably sample
single-character date-cell text) - these are exactly the states the
datepicker's targeted contrast test covers or periodic accessibility audits
must inspect.

#### Representative Checkpoints

`e2e/accessibility/app-a11y.spec.ts` covers:

- the week view (main authenticated calendar surface)
- the timed event form open (sidebar form, a hidden-until-activated region)
- the all-day event form open (a distinct field set from the timed form)
- the event actions menu open (a floating, portaled menu)
- the invalid-date validation error toast (an error state)

`e2e/accessibility/datepicker-a11y.spec.ts` covers the sidebar date navigation
region and keeps its own targeted per-date contrast regression (below).

`e2e/accessibility/booking-a11y.spec.ts` covers public booking: picker and
details (light default and stored dark theme), slots error, 409 conflict,
confirmation (confirmed, cancelled, not-found, load error), and cancel
(confirm, in-flight, success, not-found, error). CI `bun run test:e2e`
runs the whole `e2e/` tree, including this file.

#### When To Add A Targeted Regression Test

Keep focused browser assertions when the failure depends on a state or visual
composition that a general scan may not evaluate reliably. Examples include:

- hover, focus, selected, disabled, and error-state contrast
- text rendered over pseudo-elements, gradients, images, or overlays
- focus placement and focus return around dialogs
- arrow-key, Home/End, Escape, and roving-tabindex behavior
- live-region announcements
- reduced-motion, forced-colors, or high-contrast behavior

The datepicker contrast test in `e2e/accessibility` is this kind of regression
test: it checks every enabled date in default and hover states and accounts for
the selected-date pseudo-element. It complements the axe scan rather than
serving as a pattern to copy for every control.

#### Component Test Expectations

Accessibility behavior belongs in the component's normal behavior tests. Use
role and accessible-name queries and drive the UI as a user would:

```tsx
const nextMonth = screen.getByRole("button", { name: "Next month" });

await user.click(nextMonth);
await user.tab();
await user.keyboard("{ArrowRight}");
```

Test meaningful outcomes such as focus movement, updated `aria-expanded` or
`aria-selected` state, connected errors/descriptions, and keyboard operation.
A successful `getByRole` query is useful pressure toward semantic markup, but
it is not an accessibility audit by itself.

#### Daily Staging Confidence

Once per day, use the accumulated staging build as a normal Compass user. This
is an unstructured product-confidence pass, not a PR checklist: do not replay
individual changes or map observations back to every merged PR. File any
regression observed during normal use as a bug.

Per-PR confidence comes from automated tests, agent-driven browser validation,
and the independent diff-first review. If those gates cannot establish
correctness, `ship` pauses instead of delegating manual verification to the
owner. Separately scoped accessibility audits can still examine judgment-based
WCAG criteria without becoming a release requirement for each PR.

#### Workflow For UI Changes

1. Prefer semantic HTML and shared semantic color tokens while implementing.
2. Add role/name and keyboard coverage to the affected component tests.
3. Reuse an existing axe checkpoint when it already renders the changed state;
   otherwise add the smallest representative checkpoint.
4. Add a targeted browser regression only for behavior the general scan does
   not protect.
5. Run `bun run test:web`, `bun run lint`, and `bun run verify web`.
6. Record completed agent-driven browser validation in the PR. Do not add
   manual tasks; pause `ship` if the behavior cannot be confirmed.

Browser-based accessibility checks are appropriate for CI and pre-push
verification. Keep commit hooks limited to fast static checks so normal commits
do not need to start a browser. There is no Husky/git-hook setup in this repo;
run `bun run verify web` yourself before pushing web/JSX/CSS changes, and rely
on `test-unit.yml` (`static`, including lint and type-check) and `test-e2e.yml` (`bun run test:e2e`,
which includes `e2e/accessibility`) in CI as the enforcement backstop. Both
workflows trigger on any push/PR that isn't docs-only, so web changes are
always covered.

#### Biome Rule Levels

`biome.json`'s `linter.rules.a11y` splits into two groups. Rules with no
standing `biome-ignore` anywhere in the repo are `"error"`, so a new violation
fails `bun run lint` and CI immediately. Rules that have narrow, pointer-only
exceptions already in the codebase (`noNoninteractiveTabindex`,
`noRedundantRoles`, `noStaticElementInteractions`, `useAriaPropsSupportedByRole`,
`useSemanticElements` - grep for `biome-ignore lint/a11y/<rule>` to find them)
stay at `"warn"`: promoting a rule to `"error"` while it still has documented
exceptions would make "error" mean something less than zero exceptions. Before
promoting a currently-`"warn"` rule, confirm it has no existing
`biome-ignore` for that rule.

References:

- [WCAG 2 overview](https://www.w3.org/WAI/standards-guidelines/wcag/)
- [WAI-ARIA Authoring Practices Guide](https://www.w3.org/WAI/ARIA/apg/)
- [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing)
- [Accessibility Insights for Web](https://accessibilityinsights.io/docs/web/overview/)

### CI-Only Flakiness From Worker Contention

`test-e2e.yml` runs in a container-limited GitHub Actions runner. Two
Playwright workers there compete with each other and with the shared dev
server for CPU, so whichever spec happens to be mid-render/mid-save when
both workers spike can blow through its assertion timeout — a different
spec each time, unrelated to the diff under test. Signature: a form-save or
element-visibility timeout in a spec the PR did not touch, passing on retry
or on a rerun of just the failed job. `playwright.config.ts` now runs a
single worker in CI (`workers: process.env.CI ? 1 : 2`) specifically to
remove this contention; if it recurs, treat it as environmental before
assuming a spec regressed, and do not "fix" it by deleting the test.

A test that fails **deterministically** isn't automatically a real product
bug either — it can be the harness racing a CSS transition. One
`create-event-mouse` spec failed 100% of the time in reduced-day-count mode
(narrow viewport + sidebar open): `ensureSidebarOpen`
(`e2e/utils/event-test-utils.ts`) waited for the sidebar to become *visible*
but not for its `transition-[width]` to finish, so the test measured column
positions mid-animation and then dragged after the grid had reflowed to a
different column count. Fixed by `waitForMainGridWidthToSettle` (polls
`#mainGrid`'s measured width until two consecutive reads match), called from
the just-opened branch of `ensureSidebarOpen` — this benefits any spec that
opens the sidebar and then immediately depends on grid geometry. Verify
empirically (a throwaway debug spec dumping live `getBoundingClientRect()`s)
before concluding either way: "flaky = environment" and "deterministic = app
regression" are both assumptions, not defaults.

### CI-Only Flakiness From Branch Divergence

A web unit test that times out only on GitHub Actions and never locally
(even when replaying CI's exact file execution order or running
`--rerun-each=25`) is not always pure environmental flake. If the failing
test lives in shortcut or view-store code, first check whether the PR branch
is behind `main` on those exact files — merging/rebasing main in has
resolved this class of failure before, because divergent shortcut/store code
interacting with CI's file ordering was the real contributor, not the
environment. Only treat it as a genuine flake
(`gh run rerun <run-id> --failed`) once the branch is confirmed current and
the diff doesn't touch the failing area.

## Testing Realtime And Sync Changes

For SSE or sync work:

- test backend emitters/handlers where possible
- test web SSE hooks for listener registration and dispatch behavior
- test event listeners and operations if refetch or optimistic behavior changed

## Common Gaps To Watch

- optimistic event ids
- recurring event scope handling
- local-only versus authenticated repository behavior
- storage migration paths
- date parsing around all-day events and UTC formatting
