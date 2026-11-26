# Judged fine

Areas a tech-debt sweep examined and deliberately kept, with the reason.
Append only; newest block first. Read this before proposing anything.

An entry closes the question until that code's **behavior** changes. A new
sweep does not re-open one because it would have decided differently, or
because the code still looks the way the entry says it looks. If an entry is
genuinely wrong, say so to the user rather than quietly re-litigating it.

Format: one `##` block per sweep date, one bullet per area, each naming the
reason it stays.

## 2026-11-26

One finding, shipped as the life week preview's hidden-event check. Swept the
five merges that landed after the 2026-11-25 ledger (#5359, #5360, #5361,
#5362, #5364); #5358 was that sweep's own output and is excluded, and #5341
through #5357 are closed by the 2026-11-24 and 2026-11-25 entries and were not
re-opened. Gate step 1 was clean on the three named detectors: `bun knip`
reports no unused files or exports (the three standing config hints), `bun
lint` passes every rule including the semantic-color, barrel and locator
checks, and `bun type-check` passes. The churn guard did not bind: no prior
sweep refactor has touched the Life view or the sync writer adapter in the last
30 days (#5313 shows up under every path only because it is this clone's
grafted root commit, 3,354 files of initial import, not a sweep touch).

- **The finding: `LifeWeekEvents` re-implemented `isEventIdHidden` as a
  literal.** `apps/calendar-web/src/events/hidden/hidden-event-id.ts` owns the
  "is this event hidden" rule, `isEventIdHidden(eventId, hiddenEventIds)`, with
  its own test file pinning the null-safe semantics. Seven sites import it:
  `assign.row.ts`, `grid-event-card-chrome.ts`, `timed-deck.layout.ts`,
  `AllDayEvents.tsx`, `MainGridEvents.tsx`, `dayAllDayRows.util.ts` and
  `filter-events-visible-on-grid.ts`. `LifeWeekEvents.tsx`, new in #5364, was
  the one site that spelled the rule out instead:
  `!(event._id && hidden.has(event._id))`. The two agree today, so this is the
  weak end of the drifted-copy class, and it is admissible on the
  discoverability mechanism rather than on a present disagreement: the next
  change to hidden-event handling will be found by grepping the owning helper,
  and the life week preview would not be in the results. That subsystem is
  live, not frozen; #5352's era added a mutation coordinator with pending
  intents that `useHiddenEventIds` now merges into the query. Confirmed no test
  covered hidden filtering in the preview: neither `LifeView.test.tsx` nor
  `e2e/life/week-preview.spec.ts` mentions hidden events, so a divergence was
  silent in both directions. Fixed with one import and one expression, behavior
  identical, plus `LifeWeekEvents.test.tsx` pinning that a hidden event stays
  out of the preview. Verified the test is load-bearing by dropping the hidden
  term and watching it fail.

- **The `"cancelled"` literal in the Google writer** (#5359). The 409 branch
  now reads the tombstone back and patches it to `confirmed`, comparing
  `existing.status !== "cancelled"`, and `google-event.normalizer.ts` compares
  the same literal. Two sites, one string, which is the shape a drifted copy
  takes, but there is nothing of ours to drift from: that value is Google's own
  wire enum, read inside the Google adapter where provider knowledge belongs.
  Minting a local constant for a third party's documented enum adds an
  indirection without removing a divergence.

- **Reflection opt-in** (#5360). Three email PRs in a row on this path, and
  this one is consolidation rather than churn: the CLI's hand-rolled
  `updateOne` with its own `optedInAt` / `reflectionDisabledAt` / `$unset`
  bookkeeping is gone, and `packages/scripts/src/commands/reflection.ts` now
  calls `reflectionEnableBlock` and `setReflectionEnabled` like the two
  controllers do. #5360 deleted a drifted copy; it did not add one.

- **The Mongo prefilter beside `hasReflectionOptIn`.** `enqueueDueReflections`
  repeats the new rule as a query (`"reflectionPreferences.enabled": true`
  plus `"reflectionPreferences.optedInAt": { $type: "date" }`) while
  `hasReflectionOptIn` states it in memory. Keep both. The query is a
  prefilter an index can serve, and the loop re-checks each candidate with
  `if (!reflectionEligible(user)) continue;`, which calls the owning
  predicate. The authoritative gate is single; a drift in the query can only
  narrow the candidate set, never send a reflection to someone who has not
  opted in.

- **The three-level zoom ladder** (#5364). "There are three zoom levels, max
  index 2" is encoded at six sites: `boundedInteger(search.zoom, 2)` in
  `life-search.ts`, `Math.min(2, Math.max(0, zoom + step))`, the two
  `disabled={zoom === 0 | 2}` guards, `[100, 200, 300][zoom]` and
  `columnWidth` in `LifeGrid.tsx`, and the `["max-w-2", ...]` /
  `["h-2.5", ...]` triples in `LifeGridRow.tsx`. All six agree, so nothing is
  diverged; the cost is only that a fourth level would mean editing six
  places. Deriving the bound from the class arrays would couple a URL
  validator to Tailwind class lists, which is a worse trade than the repeat.
  Taste, not a finding.

- **`font-[VT323,monospace]` on the Life intro heading** (#5364). An arbitrary
  Tailwind value rather than a canonical utility, which `bun lint` does not
  police (its rule covers semantic colors). It is the established convention,
  not a new deviation: eleven calendar-web sites spell the family out the same
  way, plus the booking app, and `index.css` defines no display-font token for
  them to use. Introducing one is a repo-wide change to pre-existing code,
  outside this window and outside a sweep's one-PR budget. Worth a person's
  decision, not a sweep's.

- **`LifeWeekEvents` composing its own read instead of `useWeekEventViewModel`.**
  It calls `useWeekEventsQuery` and `useCalendarEventViewModel` directly, which
  is the first two thirds of that composed hook. Deliberate and correct: the
  third part is `assignEventsToRow`, which re-packs hidden all-day events into
  shared strip lanes, and a plain `<ul>` of titles has no lanes to pack.
  Checked the thing that would actually be a bug: calendar visibility is still
  applied, because `useCalendarEventViewModel` runs
  `filterEventsByVisibleCalendars`, so an unchecked calendar's events stay out
  of the preview.

- **`events.slice(0, 3)` in the preview** (#5364). Same judgment as the
  `reflection-content.ts` section caps on 2026-11-09: a display cap in the
  component that displays, with no second site deriving from it.

- **#5361 and #5362.** `knip` and `dompurify` version bumps touching
  `bun.lock` and `package.json` version strings only. No domain code for the
  three classes to apply to.

## 2026-11-25

One finding, shipped as the removal of the backend's runtime alias
registration. One merge landed after the 2026-11-24 ledger, #5357, which moved
the root `module-alias` range from `^2.2.2` to `^2.3.5`; #5355 was that sweep's
own output and is excluded, and #5341 through #5354 are closed by the
2026-11-24 entry and were not re-opened. Gate step 1 was clean on the three
named detectors: `bun knip` reports no unused files or exports (the three
standing config hints), `bun lint` passes every rule including the
semantic-color, barrel and locator checks, and `bun type-check` passes. The
churn guard did not bind: no prior sweep refactor has touched `package.json`
or `packages/backend/src/init.ts` in the last 30 days.

- **The finding: `module-alias` had no reachable consumer.** The dependency
  bump is what exposed it. `packages/backend/src/init.ts` guarded a
  `require("module-alias").addAliases({ "@backend", "@core" })` call behind
  `typeof Bun === "undefined" && __dirname.includes("/build/")`, and that
  condition can never hold. `build.backend.ts` bundles with `target: "bun"`
  and inlines everything, so Bun.build freezes `__dirname` in the artifact to
  the **source** directory (`packages/backend/src`), not the build directory,
  making the second conjunct false in the only place the branch was written
  for; under `bun --watch src/app.ts` and `bun test` the first conjunct is
  false. Three further independent reasons it could not have worked: the
  generated `build/backend/package.json` lists only `@resvg/resvg-js`, so
  `require("module-alias")` in the artifact would throw MODULE_NOT_FOUND; the
  bundle contains zero bare `@core/` or `@backend/` requires for an alias to
  resolve, verified by grep on a fresh `bun run build:backend`; and the two
  `import` statements below the block are hoisted and evaluated before it
  runs, so even under Node the registration would land after the imports it
  was meant to serve. Removing it also drops the unread `_moduleAliases` block
  in the root `package.json`, which only `module-alias`'s `init()` ever reads,
  and nothing imports `module-alias/register` or calls `init()`. What this
  prevents: a false signal that the backend artifact registers runtime
  aliases, wired so it would crash if it ever fired, plus a recurring cost on
  a runtime dependency with no consumer. #5357 is that cost, and it was this
  window's only merge.

- **`engines.node: ">=24.0.0"`** stays. It constrains what a contributor's
  local toolchain must provide, and is not evidence of a Node runtime for the
  bundle: every shipped entrypoint is Bun (`CMD ["bun", "app.js"]` in
  `self-host/Dockerfile.backend` and `Dockerfile.sync`, which
  `publish-docker-images.yml` builds and `compose.yaml` runs by image), and
  the bundle cannot run under Node at all. Confirmed by trying: `node app.js`
  on a fresh build dies at `__require is not a function` long before it
  reaches `init.ts`.

- **`"main": "build/src/app.js"` in `packages/backend/package.json`** is a
  stale path; the build writes `build/backend/app.js`. Left alone. Nothing
  reads it: no TypeScript file imports the bare `@compass/backend` or
  `@compass/core` specifier, all cross-package imports go through the
  `@core/*`-style `tsconfig.json` paths, and `@compass/core` already carries
  `"main": ""`. The root `dependencies` entries for the two `@compass/*`
  packages exist to create the workspace symlinks, which bun does from
  `workspaces` regardless. Correcting or emptying the field is a packaging
  decision with no current caller to validate it against, so it is a fix
  looking for a problem rather than a finding.

- **Pre-existing backend failures.** `bun test:backend:fast` reports 13
  failures in `GET /api/config` and the SSE server suite, on this branch and
  identically on an unmodified `origin/main` tree. Environmental, unrelated to
  the diff, and not this sweep's to fix.

## 2026-11-24

No finding. Swept the 14 merges that landed after the 2026-11-23 ledger
(#5341 through #5354); #5340 was that sweep's own output and is excluded.
Gate step 1 was clean on the three named detectors: `bun knip` reports no
unused files or exports (the three standing config hints), `bun lint` passes
every rule including the semantic-color, barrel and locator checks, and
`bun type-check` passes. No file in the window overlaps a prior sweep's
refactor (#5313, #5330, #5338), so the churn guard did not bind. Everything
below was examined and kept.

- **The reflection opt-in consolidation** (`reflection-opt-in.ts`, #5352).
  Three email PRs landed on this path in one window, which is the shape churn
  takes, but it is the opposite: #5352 created one owner for the rule, and
  both callers delegate to it. `reflection-preferences.controller.ts` and the
  new `email.reflection.controller.ts` share `reflectionEnableBlock` and
  `setReflectionEnabled` rather than each gating opt-in themselves, and the
  block reasons are user-facing copy owned in that one file. The web side does
  not copy the rule either: `ReflectionPreferencesControl` renders the
  backend's 403 `message` verbatim and only falls back to generic copy when
  the status is not 403. There is no second site to drift.

- **`UP_NEXT_IMMINENT_MINUTES`** (#5353). The feature PR itself removed the
  drifted copy: `UpNextBanner` held a local `MINUTES_BEFORE_START = 2` beside
  `useUpNextEvent`'s own threshold, and #5353 exported one constant and
  imported it. Checked for a third copy, since the hook's comment says it is
  shared with the upcoming-event notifier: there is none.
  `upcoming-notifier.logic.ts` works from per-event `popupReminderMinutes` and
  `MAX_NOTIFICATION_LOOKAHEAD_MINUTES`, a different rule with a different
  owner. Nothing left to fold.

- **`_dayNumber` in `assign.row.ts`** (#5342). The New Year lane bug was a
  real divergence, so the obvious question is whether another site still
  packs spans by day of year. Repo-wide, none does: the only surviving
  `dayOfYear()` call is `reflection-content.ts`'s `Your weekly review (N)`
  subject number, which is a label and not span arithmetic. No shared
  absolute-day helper exists for the new module-private `_dayNumber` to
  duplicate, and introducing one to serve a single caller would be a fix
  larger than the problem.

- **`SYNC_TOKEN_UNSUPPORTED_FULL_SNAPSHOT_INTERVAL_MS` vs the tail of
  `CURSOR_EXPIRY_HOLD_OFF_MS`** (#5349). Both are `6 * 60 * 60_000`, in
  `sync-token-unsupported.ts` and `sync-job-dispatch.service.ts`, and the
  first's comment says it "matches the widest cursor-expiry hold-off", which
  reads like a drifted copy waiting to happen. It should stay two constants.
  They are independent policies that merely coincide today: the ladder bounds
  provider quota for incremental pulls, the interval bounds the cost of
  authoritative full snapshots. Deriving one from the other would make a
  quota tweak to the ladder's tail silently change snapshot cadence, which is
  worse than the comment going stale. The comment recording the coincidence
  and its reason is the right treatment.

- **#5350's trial teardown.** A 285-line runbook, `reflection-initialization.ts`,
  `initializeReflectionPreferences`, and five config keys were deleted at
  once, which is where dangling references normally survive because `knip`
  cannot see docs or YAML. None did: no reference remains to
  `weekly-reflection-trial`, the removed module or endpoint, or
  `rolloutEnabled`, `rolloutStartDate`, `enrollExisting`, `trialUserId` and
  `trialEmail`. `compass.example.yaml` carries no `reflection` block at all
  and the schema's `reflection` stays `.optional()` with `enabled` defaulting
  to true, so a fresh `cp compass.example.yaml compass.yaml` still parses
  under `.strict()`.

- **The two focus hooks** (`useIsAnyCalendarEventFocused.ts`, #5346).
  `useIsAllDayEventFocused` was added beside the existing hook over a shared
  `useFocusCheck`, so each consumer subscribes its own `focusin`/`focusout`
  pair where one derived value would do. That is an efficiency preference, not
  one of the three classes, and the checks are module-level stable references
  so the `[check]` dependency causes no re-subscribe churn.

- **Booking status copy** (#5349). `PUBLIC_BOOKING_UNBOOKABLE` was reworded
  and a retry affordance added, but the copy constants stay owned by
  `public-booking.view.ts` and the retry is carried as a discriminated
  `retry: "page" | "slots"` field that the component resolves against its own
  queries. No copy was duplicated into the component.

- **#5341, #5343, #5344, #5345, #5348, #5347, #5354.** A Zustand hover field
  on the existing page-jump store; a pure JSX block move in `DatePicker.tsx`
  (26 insertions, 26 deletions, the identical `withTodayButton` block
  relocated); two CSS lines; a types-only dependency bump; one new grid
  constant with a comment deriving its value; a `firstVisibleDay` argument
  threaded into one hint helper; and one Tailwind variant
  (`not-peer-checked:hover:`). Nothing for the three classes to apply to.

### A pattern in the sweep's own behavior

This is the **second consecutive sweep with no finding**, which is worth
recording because it is the first direct evidence for what the 2026-11-23
entry argued. That entry observed a 93% ship rate always at exactly the
one-PR cap, and suspected the cap was being read as a quota rather than a
ceiling. Two null results in a row, on a 14-merge window that is much larger
than the 2-merge window of the previous run, is consistent with that reading:
when the sweep is not reaching for something, it finds nothing, even with a
week's worth of feature work to look at.

The two suggestions in that entry are still open and still need a person:
state an expected ship rate rather than only a per-run cap, and move the
sweep from daily to weekly. Nothing in this run changes that recommendation,
and a sweep should not settle it by editing its own skill.

## 2026-11-23

No finding. Two merges landed after the 2026-11-22 ledger, #5334 (supertest
7.3.2) and #5339 (tslib 2.9.1); #5338 was that sweep's own output and is
excluded. Both candidates are dependency version bumps touching only
`bun.lock` and a `version` string in `package.json`, with no domain code in
either diff, so there is nothing for the three admissible classes to apply
to. Gate step 1 was clean on the three named detectors: `bun knip` reports no
unused files or exports (the three standing config hints), `bun lint` passes
every rule including the semantic-color, barrel and locator checks, and
`bun type-check` passes.

- **The date-picker cluster is no longer churning.** The standing churn
  example in `SKILL.md` has gone quiet: in the last 30 days the picker,
  keycap, shortcut and hint files took three touches total (#5291, #5278,
  #5338), and the one refactor among them removed a workaround whose
  condition had provably expired rather than reworking a shared helper
  again. The churn guard is doing its job; no action.

### A pattern in the sweep's own behavior

`SKILL.md` asks the sweep to report patterns in its own behavior, so: **the
one-PR cap is being treated as a one-PR quota.** Of the 15 sweeps recorded
since the skill landed on 2026-11-09, 14 shipped exactly one PR and one
shipped none. The skill says "the expected result of a sweep is no PR" and
"a week that yields none is also a normal week", but the ledger shows a
93% ship rate, always at exactly the cap, never above it.

Each individual finding looks defensible, and they do map onto the three
admissible classes, which is exactly what makes this hard to see from inside
a single run: the failure mode the skill was written to stop was five
refactors of one file in a week, and that specific failure is fixed. What
replaced it is subtler. A daily sweep over a small, recently reviewed repo
that lands a refactor on 14 of 15 days is not finding a real divergence 14
days running; it is meeting a daily quota, on code the previous sweep just
reviewed and approved. The cap reads as a target because it is the only
number in the skill.

This is for a human to weigh, not for a sweep to settle by editing its own
skill. Two things a person might consider: stating an expected ship rate
rather than only a per-run cap, and running the sweep weekly rather than
daily, since the window between daily sweeps is now one or two merges, which
is below the size where a real structural divergence can accumulate.

## 2026-11-22

Swept the merges that landed after the 2026-11-21 ledger (#5278, #5305, #5331,
#5332, #5333, #5335, #5336, #5337); #5330 was that sweep's own output and is
excluded. Gate step 1 was clean on the three named detectors: `bun knip`
reports no unused files or exports (the three standing config hints),
`bun lint` passes every rule, `bun type-check` passes. One finding, shipped as
the removal of `monthPickerLocale`: #5279 extracted that cloned-locale
workaround on 2026-11-17 for react-datepicker 4.x, whose `Day` did not receive
`calendarStartDay`, and #5305 upgraded to 9.x four days later, where `Week`
spreads `calendarStartDay` into `Day` and `getStartOfWeek` passes it to
date-fns as `weekStartsOn`, which outranks `locale.options.weekStartsOn`. The
condition expired, and #5305 replaced the comment that recorded it with a
one-liner, so the clone read as deliberate design while the week start was
really governed by the prop beside it. Everything below was examined and kept.

- **The keycap consolidation** (`ShortcutKeycap.tsx`, #5278). A new file plus a
  deleted `ShortcutLabel` looks like a move that left two owners, but it is one:
  every keycap call site now renders `ShortcutKeycap`, and `isMacForwardDelete`
  and `getSpokenShortcutKey` are owned once in `shortcut.util.ts`. Dropping
  `variant="keycap"` at the `ShortcutKeys` call site is not a visual change
  either; `ShortcutHint` already defaults that variant.

- **Two key-token normalizers** (`ShortcutKeys.normalizeKeyToken`,
  `ShortcutTipParts.KeycapGroup`, #5278). The first resolves user-written
  aliases (`esc`, `cmd`) and uppercases lone letters; the second only
  uppercases, because tip keys come from `shortcut-tips.data.ts` in canonical
  form and never pass through an author's spelling. Folding them would put
  alias resolution on a path that has no aliases to resolve.

- **The paste-placement rework** (#5332). Replacing the grid-draft paste preview
  with `event-paste-preview.store` left no residue: the `pastePlace` draft
  activity and `event-paste-preview.lifecycle` are gone repo-wide, net -235
  lines, and `knip` finds nothing orphaned.

- **`GRID_POPPER_MODIFIERS` and the `react-datepicker-popper` selectors**
  (#5305). The constant and the DOM queries still say "popper" after the move
  to `@floating-ui/react`, but `react-datepicker` 9 still emits that class name,
  so the selectors are correct and the constant names the thing it configures.
  Renaming for consistency is not a finding. `@popperjs/core` and
  `@types/react-datepicker` were both removed from `package.json` in the same
  PR, so no dead dependency survived the migration.

- **`captureBootShell` as module state** (#5333). A module-level handle to
  `#boot-shell` plus a `cloneNode` looks like a global, but the node it captures
  is destroyed by the first React render, so the capture has to happen before
  mount and cannot live in a component. One writer, one reader.

- **`useResetLoadingOnPageRestore` called from two strategies** (#5333). The
  redirect and Google strategies each own their own `loading` state, so the hook
  is shared code over two independent states, not a copy.

- **`c-not-found`** (#5335). The 404 redesign stopped using the utility, but
  `SomethingBrokeView` still does, so it is not dead CSS.

- **The context-menu `details` array** (#5337). A three-entry literal with a
  `flatMap` that drops empty fields. Clunky-looking, but it is the only site
  that decides which event fields the menu shows, and the time label still comes
  from the shared `getGridCardTimesLabel`.

- **#5331 (toast progress gradient), #5336 (agent shipping and release
  ownership).** A scoped CSS override and CI workflow plus docs config. Per the
  2026-11-09 precedent, workflow config is not domain duplication.

## 2026-11-21

Swept the merges that landed after the 2026-11-20 ledger (#5322, #5323, #5325,
#5326, #5327, #5328, #5329); #5324 was that sweep's own output and is excluded.
Gate step 1 was clean on the three named detectors: `bun knip` reports no
unused files or exports (the three standing config hints), `bun lint` passes
every rule, `bun type-check` passes. One finding, shipped as the removal of the
dead `rowCount` field on `CalendarEventViewModel`. Everything below was
examined and kept.

- **The two hidden-strip packers** (`assign.row.ts`, `dayAllDayRows.util.ts`,
  #5322). Both assign `hiddenStripIndex` to same-day hidden all-day events, so
  one rule now looks implemented twice. It is not one rule: the week packer
  must find a lane free across an event's whole day span via
  `findRowForEvent`, while the day packer knows every chip in a column covers
  the same day and stacks in encounter order below that column's visible
  count. Folding them would recouple the day view to week day-span packing,
  which is what the file's own comment says it deliberately avoids.

- **Re-packing `allDayEvents` twice** (`useWeekEventsQuery.ts`, #5322). The
  pipeline packs without hidden ids, then `useWeekEventViewModel` packs again
  with them. The second pass is the fix, not leftover work: the hidden-event
  set lives in its own query and must not key the shared pipeline memo, which
  many consumers hit. The `hiddenEventIds.size === 0` guard keeps the common
  case at one pass.

- **The strip offset formula** (`GridAllDayEvent.tsx`, #5322).
  `hiddenStripIndex * (HIDDEN_EVENT_STRIP_WIDTH + HIDDEN_EVENT_STRIP_GAP)` is
  spelled at exactly one site, and both constants are owned by
  `grid.constants.ts`. Nothing to converge.

- **Regex HTML rewriting in `compactListItemHtml`** (#5329). Three chained
  regexes over `<li>` markup is the shape that usually wants a DOM parse, but
  the function runs on every editor keystroke through `onUpdate`, the comment
  states the provider behavior it repairs, and the three cases are pinned by
  tests. A `DOMParser` rewrite would be slower on the hot path and risks
  changing what TipTap round-trips. Touch only for a real formatting defect.

- **Code 290 overlapping its message pattern**
  (`mongo-network-error.util.ts`, #5323). The numeric code, the
  `TransientTransactionError` label, and the
  `transactionLifetimeLimitSeconds` message regex all match the same Atlas
  failure, which reads like three detectors for one condition. All three are
  load-bearing: the job wrapper sometimes flattens a cause into its own
  message string, where no `code` or `errorLabels` survive, and the second
  assertion in the new test pins exactly that case.

- **`LIFE_QUOTES` as a flat literal array** (#5328). A one-line data append to
  a 70-entry `as const` list. Data, not structure.

- **#5325, #5316 (README prose), #5327 (snappy bump), #5326 (autofix merge
  guard and watchdog).** Docs, a dependency version, and CI workflow config.
  Per the 2026-11-09 precedent on the macOS CI queue, workflow config is not
  domain duplication.

## 2026-11-20

Swept the merges that landed after the 2026-11-19 ledger (#5306, #5311, #5314,
#5315, #5316, #5321); #5313 was that sweep's own output and is excluded. Gate
step 1 was clean on the three named detectors: `bun knip` reports no unused
files or exports (the three standing config hints), `bun lint` passes every
rule, `bun type-check` passes. One finding, shipped as the single
`isEmailSequenceStopped` rule the reflection gate now consults. Everything
below was examined and kept.

- **`distinctTitles` applied twice to memories** (`reflection-content.ts`,
  #5321). `selectReflectionEvents` dedupes titles and slices to 3, then
  `highlights(input.memories)` dedupes again. The second pass is a no-op on
  the selector's output, but `highlights` is the renderer's own guarantee
  across all four sections and must not depend on which caller fed it.
  Removing it would couple the renderer to the selector's cap.

- **`chooseForDay`'s recursive reassignment** (`reflection-content.ts`,
  #5321). A backtracking search with a shared `tried` set, inside a closure,
  to spread highlights across days when one title is another day's only
  option. Intricate, but the comment states the bound (at most three selected
  days participate) and the window is bounded by `limit`. Taste, and the new
  tests cover the sparse-week and reassignment cases.

- **`Math.min(4, rows.length)`** in `dispatchReflectionBatch`
  (`reflection-dispatch.ts`, #5321). A bare concurrency literal in a file
  whose neighbours are named in `email.constants.ts`. Naming it is a rename
  with no correctness or discoverability gain; the provider spacing that
  actually matters already goes through `EMAIL_SEND_PROVIDER_SPACING_MS`.

- **The weighted page budget** in `readReflectionPage`
  (`reflection-read.service.ts`, #5321). The `floor(PAGE_SIZE / seriesWork) + 1`
  / `PAGE_SIZE + 1` limits plus a greedy weighted prefix read like an
  off-by-one waiting to happen. Checked: `windows` is capped at 8 by
  `ReflectionReadRequestSchema`, so `seriesWork <= 8 < PAGE_SIZE`, and the
  first row can therefore never exceed the budget and strand the page with an
  empty `rows` and a null `nextCursor`. Correct as written; the cap is what
  makes it correct, so leave both alone together.

- **`"daily"` cadence after the weekly-only switch** (#5321). Enrollment now
  always mints `"weekly"` and `dispatchReflection` cancels any non-weekly
  edition, which makes the `cadence === "daily"` branches in
  `reflection-schedule.ts` and `reflection-content.ts` look unreachable. They
  are not: `welcome-review.content.ts`, the preview loop in
  `email-dispatch.service.ts`, and the `reflection` CLI all still mint daily
  editions down the onboarding path, which passes `options.onboarding`.

- **"Sundays at 10:30 a.m." spelled in copy** (`ReflectionPreferencesControl.tsx`,
  `welcome-sequence.content.ts`). The schedule is owned by `reflectionSendAt`
  and `nextReflectionSend`; two user-facing strings restate it, so changing
  the send hour would leave both promising the old time. Real, but the fix is
  larger than the problem: the web cannot import `@backend/*`, and prose like
  "every Sunday at 10:30 a.m." is not mechanically derivable from `"10:30"`
  and `day() !== 0` without a new core formatter. Revisit if the send time
  ever actually moves.

- **The reflection config propagation path** (`deploy-write-email-block.sh`,
  `_deploy-environment.yml`, `config.constants.ts`, `compass.config.ts`,
  #5321). Four sites must list each new key, which is the classic drift
  shape. Already closed mechanically: `deploy-email-config.test.ts` asserts
  the generated block *and* greps the workflow for both new `vars.` lines.
  Both of #5321's new keys were added to every site.

## 2026-11-19

Swept the merges that landed after the 2026-11-18 ledger (#5281, #5284,
#5289, #5290, #5291, #5292, #5293, #5299, #5312, plus dependency bumps);
#5288 and #5201 were prior sweeps' own output and are excluded. Gate step 1
was clean on the three named detectors: `bun knip` reports no unused files or
exports (the three standing config hints), `bun lint` passes every rule, `bun
type-check` passes. One finding, shipped as the removal of the dead
`sidebarShort` surface in `connection-health-copy.util.ts`. Everything below
was examined and kept.

- **`"edit-delete-this-only": hotkeyKeycaps("Mod+Delete")`** in
  `REGISTRY_RUNTIME_KEY_SOURCES` (#5289). The only row in that table that
  spells a hotkey inline instead of naming an `APP_SHORTCUT_BINDINGS` entry,
  which reads like the `WEEKS_PER_ROW` shape. It is not: only 7 of the ~60
  bindings have their `.hotkey` read by a handler at all, and the grid's
  runtime literals (`"Delete"`, `"Mod+D"`, `"Mod+C"`, `"Mod+V"`,
  `"Shift+Tab"`) predate this window. Folding one row would be a cosmetic
  half-fix of a file-wide convention. What the table owns, legend keycaps or
  runtime hotkeys, is a decision for a human; `shortcuts.registry.bindings`
  already pins registry rows to the table either way.

- **`useOpenLocationShortcut` importing `mapsUrlForLocation` from the event
  form** (#5312). One import edge from `@web/shortcuts` into
  `@web/views/Forms`, not a second copy: the shortcut and the form's link
  build the URL from the same function, so the Maps query string cannot
  drift. Moving the helper to a neutral module is a rename with no
  correctness or discoverability gain.

- **`upcomingCount = Math.max(3, meetings.length)`** in
  `reflection-content.ts` (#5290). The upcoming list is uncapped once
  meetings are present, so a heavy week prints every meeting. That is the
  stated point of the feature (highlight meetings), and bounding it is a
  product decision, not debt.

- **`nextStep`'s `plainUrl`** (#5290). Computed before the `utm_*` params are
  set, so the text email's link is untracked while the HTML href is tracked.
  Reads like an ordering slip; it is the normal split between a clickable
  href and a URL a reader retypes. Behavior change either way, so not a
  sweep's call.

- **`MeetLandingExample`** (#5292). 179 new lines next to the real guest
  flow, but it renders `PublicBookingPicker`, `PublicBookingSlotSummary` and
  `public-booking.format` directly; only the fixture availability and the
  demo host copy are local. Nothing to drift.

- **`getHorizontallyAdjacentTarget`'s caller** (#5299). The day/week branch
  is now a nested ternary three levels deep. Taste, and the three arms are
  the three real cases.

- **`ProviderDelayedToast` calling `useConnectGoogle()`** (#5284). The toast
  names the connection's own product ("Apple Calendar updates are delayed")
  while its Refresh button runs the Google refresh. Not a provider-name
  branch introduced here: `useConnectProvider` ignores `kind` for refresh and
  calls `refreshGoogleSync()` for every provider, so the toast matches the
  banner and the sidebar. Making refresh provider-aware changes behavior
  across every connection surface and belongs to a human.

- **Escalated, not swept: the shadowed `actionRequired` branches** in
  `connectionHealthCopy` (`connection-health-copy.util.ts`, from #5241). The
  `state === "actionRequired" || state === "disconnected" ||
  isReauthReason(...)` block always returns, so the later
  `actionRequired && consentRequired` and `actionRequired &&
  isRefreshReason(...)` blocks cannot run: an `actionRequired` connection
  whose reason is `workOverdue` or `providerErrors` is told "Calendar needs
  reconnecting" instead of the refresh copy the author wrote for it. Deleting
  the blocks would hide an intent; reordering them changes what users read.
  Left in place and reported.

## 2026-11-18

Swept the six merges that landed after the 2026-11-17 ledger (#5280, #5282,
#5283, #5285, #5286, #5287); #5279 was that sweep's own output and is
excluded. Gate step 1 was clean on the three named detectors: `bun knip`
reports no unused files or exports (the three standing config hints), `bun
lint` passes every rule, `bun type-check` passes. One finding, shipped as the
single `isOAuthCallbackQueryEmpty` rule that both OAuth callback doors now
gate on. Everything below was examined and kept.

- **#5283's 6,058-line Mac removal.** Checked for residue the detectors
  cannot see: dead branches and expired conditions rather than unused
  exports. The surviving trims are complete and deliberate.
  `oauth-state.ts` keeps a documented tolerance for legacy `d: true` so
  OAuth state tokens minted by the archived app still verify in flight, and
  `connection.routes.ts` drops the `desktop=1` redirect param with it. No
  orphaned branch found.

- **`BillingCheckoutRequestSchema` going `.strict()`** (#5283). The schema
  went from `{ returnTo: z.literal("desktop").optional() }` to
  `z.object({}).strict().default({})`, so a body carrying any property now
  fails parsing where it used to be ignored. That reads like a
  compatibility break next to the deliberate legacy tolerance kept in
  `oauth-state.ts` ten files away, but only the archived Mac app ever set
  `returnTo`, and the embedded web panels post no body at all. Nothing live
  can send a property for `.strict()` to reject.

- **`DESKTOP_QUICK_ADD_PALETTE_PLACEHOLDER`** (`more.cmd.constants.ts`). The
  name survives the Mac archival and reads like residue, but its only gate is
  `selectIsCmdPaletteCreateMode`, a live web palette feature. Renaming for
  consistency absent a correctness or discoverability problem is explicitly
  inadmissible. Left alone.

- **#5286's ring-color fix.** Replaced `gridEventSidebarEditingBoxShadow(indicatorColor)`
  with the `GRID_EVENT_SIDEBAR_EDITING_BOX_SHADOW` constant and dropped the
  `theme.getContrastText` fallback for `var(--text)`, net 33 lines removed
  across six files. A function collapsing to a constant once its only
  argument stopped varying is finished work, not a lead.

- **The `apple` early return in `shouldRelayProviderOAuthCallbackTelemetry`**
  (#5282). Sits one line above this sweep's finding and was deliberately not
  folded into it. `provider === "apple"` skips the relay because the form POST
  already recorded the callback, which is a fact about Apple's `response_mode`,
  not about whether the query carries anything. Emptiness is core's rule;
  double-count avoidance is this file's. They change for different reasons,
  so only the emptiness half moved.

- **`asNonEmptyString`** (`oauth-callback.analytics.ts`). A third private
  `length > 0` check over the same callback fields, which looks like the
  copy to fold next. It is not: it narrows four `unknown` values straight off
  the request (including `oauthErrorDescription`, which the emptiness rule has
  no opinion about) and it agrees with core's semantics rather than diverging
  from them. Noted here because if it ever starts trimming independently, the
  right move is to have it call the owning rule, not to add a fourth copy.

## 2026-11-17

Swept the five merges that landed after the 2026-11-16 ledger (#5271, #5273,
#5274, #5275, #5276); #5270 was that sweep's own output and is excluded. Gate
step 1 was clean on the three named detectors: `bun knip` reports no unused
files or exports (the three standing config hints), `bun lint` passes every
rule, `bun type-check` passes. One finding, shipped as the removal of both
stale `patchedDependencies` entries, which `bun install` reports on every run
in every worktree. Everything below was examined and kept.

- **`SettingsModal.tsx`'s `useState`-wrapped getter ref** (#5276). A
  `useState(() => ({ get current() { ... } }))` object standing in for a ref,
  so `OverlayPanel` reads `skipFocusRestoreRef.current ||
  closedForGuestAuthHandoff` at unmount rather than at render. It reads as a
  fake ref and is the kind of seam that spreads, but it cannot misbehave:
  `usePaletteAwareOverlayDismiss` returns a `useRef`, so the identity the
  getter closes over is stable for the component's life, and
  `closedForGuestAuthHandoff` is read through `getState()` precisely because
  unmount is after the store settled. Declined as taste: there is no mechanism
  by which it produces a wrong focus target. If a second overlay host needs
  the same unmount-time read, that is the point to name a
  `useLatchedSkipFocusRestore` hook, not now with one caller.

- **`closedForGuestAuthHandoff` not reset by `closeSettings`** (#5276). The
  flag latches true on the guest hand-off and is cleared by
  `openSettings`, `toggleSettings` and `beginGuestMeetingSetup`, but not by
  the plain `closeSettings`. Looks like a leak; is not one. Every path that
  mounts Settings again clears it first, and the flag is only ever read while
  Settings is unmounting, so a stale true can never reach a second dismiss.
  Resetting it in `closeSettings` too would be harmless but would also be a
  change with no failure behind it.

- **`isTransientSyncJobError` composing two predicates** (#5275).
  `RETRYABLE_NETWORK_CODES` in `provider-transient-error.util.ts` and
  `TRANSIENT_MONGO_MESSAGE_PATTERNS` in `mongo-network-error.util.ts` overlap
  on `ETIMEDOUT` and `ECONNRESET`, so the two look like one list split in
  half. They are not: the provider side matches an `error.code` property on
  HTTP/port failures, the Mongo side matches driver message text and error
  names, and `core` deliberately holds no mongodb runtime dependency. They
  change for different reasons, and the new function composes them by name
  rather than merging the tables. Correct as written.

- **The `FormCardIconRow` 20px line box** (#5271). The file now writes the
  `text-sm` line height five ways: `FORM_CARD_FIELD_LINE_HEIGHT = "1.25rem"`,
  `FORM_CARD_ICON_ROW_LINE_CLASSNAME = "h-5 leading-5"`, `leading-5` inside
  `FORM_CARD_FIELD_INPUT_CLASSNAME`, and the bare `leading-5` that #5271 put
  on the row when it dropped the `h-5` that was clipping multi-line guest
  content. That is the closest thing in this window to a class-2 divergence,
  and #5111 and #5271 are both evidence this alignment does break in
  practice. Declined anyway: all five literals sit in one 48-line file where
  they are read together, so there is no distant site that can drift
  unnoticed, and the row genuinely cannot reuse the constant because the
  `h-5` half is what it had to remove. Splitting a `leading-5`-only constant
  out would add an export to spare one literal. Revisit only if a sixth copy
  appears outside this file.

- **The gamebook `[[Key]]` markup** (#5274). `KEY_MARK = /\[\[(.+?)\]\]/`
  with `split` and an odd-index-is-a-key convention is a miniature parser in a
  static page, and `.filter((part) => part.text)` quietly drops empty
  segments. It is contained in one 40-line function, the story file is its
  only input, and a mis-marked line degrades to visible brackets rather than
  breaking the page. Not worth a PR.

- **The guest-overflow and holiday-memory fixes** (#5271). The holiday
  detection in `reflection-context.ts` matches
  `providerCalendarId.includes("#holiday@")` or `/\bholidays\b/i` on the
  display name, which is provider-shaped string matching in domain code and
  sits near the "never branch on a provider name" rule. It is a heuristic over
  calendar identity, not a provider capability branch, and tightening it is a
  product decision about what counts as a personal memory. Escalate rather
  than sweep if it ever misclassifies.

- **#5273's idempotency prefix bump.** `CHECKOUT_IDEMPOTENCY_PREFIX` went
  `v10` to `v11` because the create params changed, which is exactly what the
  comment above it tells you to do. A hand-maintained version counter looks
  like debt but is the cheapest correct mechanism here; deriving it from a
  hash of the params would be a fix larger than the problem.

## 2026-11-16

Swept the two merges that landed after the 2026-11-15 second sweep's ledger:
#5267 was that sweep's own output and is excluded, leaving #5268 and #5269 as
the candidates. Gate step 1 was clean: `bun knip` reports no unused files or
exports (the three standing config hints), `bun lint` passes every rule,
`bun type-check` passes. One finding, shipped as the legal links' footer jump
index deriving from `SOCIAL_LINKS`. Everything below was examined and kept.

- **#5268's `footerDigit` helper.** The digit beside a footer link now derives
  from `FAQ_ITEMS.length` instead of the hardcoded `String(index + 6)` and the
  per-link `digit:` fields it replaced. That is the same class of fix as this
  sweep's finding, already done one level up, and adding the sixth FAQ row in
  the same PR is what made it necessary. Finished work, not a lead.

- **`describedById` on `WelcomeFaqList`.** #5268 removed the FAQ hint
  paragraph and its `describedById=` from `WelcomeModal.tsx`, which leaves the
  prop looking orphaned, but `WelcomeGuideBody.tsx` still passes it for its own
  "Tip: Press a number" paragraph. Live, with one caller. Not dead code.

- **The `RETRO_TITLE_CLASS` / `titleClassName` escape hatch** (#5268,
  `AuthModal.tsx` and `OverlayPanel.tsx`). A class-name prop that overrides a
  component's default typography is the kind of seam that spreads, and this is
  now the eighth `font-[VT323,monospace]` literal. Declined for the reason the
  2026-11-15 second sweep gave for the other seven: they are byte-identical
  copies of a distinctive, greppable literal, none derives from a token, so
  none can silently disagree with another. `titleClassName` has exactly one
  caller and `OverlayPanel` keeps its default when the prop is absent, so
  nothing else moved. If the display font is ever swapped, name a `--font-pixel`
  token in `@theme` as part of that change.

- **The welcome FAQ and landing copy rewrites** (#5268, #5269). New questions,
  reworded answers, and a reshaped tour script, including the `tour_1_next`
  knot that gives both tour-stop-1 branches one shared continuation. Product
  copy iteration on a surface still being written, of the
  `reflection-life-image.ts` kind. The one structural thing #5268 touched that
  could diverge is this sweep's finding.

- **`useWelcomeJumpShortcuts`'s doc comment.** Says "1-6 toggle FAQ items",
  which matches the six rows in `FAQ_ITEMS` today, and the code itself reads
  `FAQ_ITEMS.length` rather than any literal. Prose that restates a derived
  count can age, but it cannot change behavior and no detector reports it.
  Noted rather than spent.

## 2026-11-15 (second sweep)

Swept the two merges that landed after the earlier 2026-11-15 sweep's ledger:
#5265 was that sweep's own output and is excluded, leaving #5264 as the only
candidate. (#5264 was still open when that sweep ran, which is why it deferred
the landing game "while #5264 is open"; that reason has now expired.) Gate step
1 was clean: `bun knip` reports no unused files or exports (the three standing
config hints), `bun lint` passes every rule, `bun type-check` passes. One
finding, shipped as the landing page's modifier-key detection moving into
`journey.js` and matching the app's `detectPlatform()` rule. Everything below
was examined and kept.

- **Seven `font-[VT323,monospace]` literals** across `WelcomeModal.tsx`,
  `WelcomeGuideBody.tsx` and `SomethingBrokeView.tsx` (#5264 added two).
  `@theme` in `index.css` owns font families and would naturally hold a
  `--font-pixel` token, so this looks like the three-overflow-predicates case
  one step further along. Declined anyway: all seven are byte-identical copies
  of a distinctive, greppable literal, and none of them derives from a token,
  so there is no asymmetry that could make two of them silently disagree. That
  is the "name an owner once if a fourth copy appears" nudge, which is
  consistency, not debt. If the display font is ever swapped, name the token in
  `@theme` as part of that change rather than folding these seven first.

- **`SignUpForm.tsx`'s inline `resolveModifier("Mod") === "Meta" ? "⌘" : "Ctrl"`.**
  Reads like a second copy of the Mod display rule that `ShortcutLabel.tsx`
  owns, but it cannot disagree with it: `resolveModifier("Mod")` returns
  `"Meta"` exactly when `detectPlatform() === "mac"`, which is the same
  condition that makes `ShortcutLabel`'s `metaIcon` the Command glyph. The only
  difference is text instead of an icon component, which is what that key needs
  inside a prose sentence. Not a drift.

- **`ShortcutLabel.tsx`'s `WindowsLogoIcon` branch.** Unreachable for a `"Mod"`
  token for the reason above, and no call site passes an explicit `"Meta"`,
  `"cmd"` or `"command"` token today, so the branch never renders. It is
  defensive cover for the aliases `ShortcutKeys.tsx` deliberately accepts
  rather than a mistake, and it predates this window. Noted rather than spent.

- **#5264's typing-toggle removal.** Checked by hand because `knip` does not
  follow this static page: `INSTANT_KEY`, `instant`, `setInstant`,
  `instantButton`, the `#instant` button and its CSS block all went together,
  and the only `instant` left in `src/landing/` is an unrelated word in a
  comment about skipping feeling instant. Nothing dangling.

- **The landing page's visual polish** (`crt.css`, the terminal-key pills, the
  fixed card height, the pixel-font welcome headings). Three feature PRs in two
  days on a surface that is still being designed. Visual design iteration on a
  product surface, of the `reflection-life-image.ts` kind, not structural debt.
  The one thing taken from #5264 is a correctness divergence, not its shape.

## 2026-11-15

Swept the 4 merges that landed after the 2026-11-14 sweep's ledger (#5259,
#5261, #5262, #5263); #5257 was that sweep's own output and is excluded. Gate
step 1 was clean: `bun knip` reports no unused files or exports (three standing
config hints), `bun lint` passes every rule, `bun type-check` passes. One
finding, shipped as the command-palette all-day shortcuts reading
`APP_SHORTCUT_BINDINGS` / `KEYMAP`. Everything below was examined and kept.

- **Onboarding unification** (#5259). WelcomeKeyboardShortcutsStep is gone; the
  practice path now hands off from ShortcutShowcase. Sign-up Mod+digit jumps use
  `AUTH_SIGNUP_FIELD_DIGITS_BY_KEY` (name/email/password) rather than
  `KEYMAP.jumpFormField` (event-form 0-9). Shared shape, not shared intent: the
  two lists would diverge under a plausible next field. Toast chrome and
  NoticeCard already share panel tokens; no parallel copy left.

- **The landing game** (#5262, #5263). 1,500 lines of new static page plus a
  Kit reminder route, still being polished in-flight by #5264. New code, not
  debt; a sweep the day after a feature lands is the worst time to judge its
  shape. `LANDING_PATH` / `LANDING_HTML` / `LANDING_ASSET_DIR` already live in
  one module that the Dockerfiles, `copy-static-assets`, `dev.ts`, and
  `serve-web` import. Leave it while #5264 is open.

- **Signup digit-jump vs form digit-jump.** Same hold-Mod gesture, different
  target tables. Folding them would couple onboarding field order to the event
  form's DOM order.

- **`ts_code_files` in `detect-code-changes.sh`.** Still the 2026-11-14 leftover
  alias. Nothing new; still not spent.

## 2026-11-14

No finding. Two merges landed after the 2026-11-13 sweep: #5255 was that
sweep's own finding and is excluded as its output, leaving #5256 as the only
candidate. Gate step 1 was clean: `bun knip` reports no unused files or
exports (three standing config hints, down from four now that the native
tree is gone), `bun lint` passes every rule, `bun type-check` passes.

- **The native repository extraction** (#5256, 908 deleted files). A move this
  large is the likeliest place for a dangling reference, since no detector
  follows shell, workflow, or Markdown paths, so each deleted non-resource
  path was grepped against the remaining tree. The three hits are all
  deliberate: `docs/README.md` rewrites its five desktop links to
  `compass-calendar-mac` blob URLs rather than leaving them local,
  `agent-loop-routine.test.ts` asserts `existsSync(".github/workflows/test-macos.yml")`
  is `false` as a boundary guard, and `desktop-menu-shortcuts.contract.ts`
  mentions `CompassKitTests` in a comment about who consumes the shared
  export. Nothing left behind in `package.json`, `knip.json`, or the
  workflows.

- **`detect-code-changes.sh` losing its `contracts` output** (#5256). The
  `apps/calendar-macos/**` filter and the `contracts` leg were removed
  together with their nine-argument `write_outputs` positions, and
  `detect-code-changes.test.sh` dropped the two macOS cases and renumbered
  every expectation in the same commit, so the detector and its fixture
  cannot drift apart. `contracts:swift` itself is retained and repointed from
  a hardcoded `apps/calendar-macos/...` path to `COMPASS_MACOS_DIR`, with the
  native side owning the check per `macos-repository-boundary.md`.

- **`ts_code_files="$code_files"`** in `detect-code-changes.sh`. Now a
  pointless alias, left where the macOS exclusion used to compute it. Taste,
  not debt: nothing can diverge, no tool reports it, and the name still
  carries the "TS, not native" meaning through the pipeline below it. Noted
  rather than spent.

- **`test-repository-boundary.yml`** (#5256). Its job is named `macos` on
  purpose, to supply the context the organization ruleset still requires
  while the native repository owns the real rollup; a rename would hang every
  PR on a check that never reports. The `grep -RE 'runs-on: +macos-'` arm sits
  inside an `if`, so its no-match exit status cannot trip the step's `bash -e`.
  Verified, not changed.

## 2026-11-13

Swept the 8 merges that landed after the 2026-11-12 sweep's own output (#5239,
#5241, #5244, #5248, #5249, #5251, #5254, and #5236 which landed after that
sweep ran); #5240 was that sweep's finding and is excluded as its output. Gate
step 1 was clean: `bun knip` reports no unused files or exports (only the four
standing config hints), `bun lint` passes every rule, `bun type-check` passes.
One finding, shipped as the core-owned command submit deadline. Everything
below was examined and kept.

- **`provider-transient-error.util.ts` and its four call sites** (#5244). The
  new shared module is imported by `google-error.ts`, `microsoft-error.ts` and
  both calendar adapters rather than restated at any of them, which is the part
  that would have mattered. `providerHttpResponseFacts` handles both `Headers`
  and a plain record because gaxios and `fetch` disagree on header shape, not
  because anyone duplicated it.

- **`isRetryableProviderHttpStatus`'s `status === 503 || status >= 500`** in
  `provider-http-retry.util.ts`. The `503` arm is subsumed by `>= 500`, so it is
  genuinely redundant, but no tool reports it, nothing can diverge, and the
  explicit arm documents the Graph throttling case next to `429`. Noted rather
  than spent: a two-token edit is not worth a PR, and folding it would make the
  next reader look up whether 503 was deliberate.

- **`microsoftGraphRequest`'s separate `parseJsonOrEmpty` and
  `readGraphJsonBody`** (#5244). Two JSON readers on one request path, but they
  want opposite things: the `emptyOk` path swallows a parse failure because
  Graph DELETE has no body, while the normal path must rethrow a `SyntaxError`
  carrying response status and content-type so the new transient classifier can
  see it. Folding them would have to reintroduce the distinction as a flag.

- **`event-mutation-user-message.ts`** (#5248). Adds `syncUnavailablePendingMessage`
  and `providerSaveBrandName` beside the existing product-name map. Two provider
  name maps in one file looks like debt, but they are different copy registers
  ("Outlook" in progress copy, "Microsoft Calendar" in failure copy) and the
  module is already the single owner both web and sync import from.

- **`job.repository.ts`'s `$min` to `lastErrorAt` swap plus the new
  `inFlightProviderErrors` probe** (#5251). The probe is a fourth near-identical
  `findOne` in `nextRunAfter`'s candidate list. Shared shape, not shared intent:
  each candidate reads a different state/failureClass pair and the sort keys
  differ, so a generic helper would take the whole query as a parameter and save
  nothing.

- **`calendar-list.translation.ts`'s `map` to `flatMap`** (#5254). A
  seven-line filter-in-place with the retention rationale in a comment. Smallest
  correct shape for the fix; a separate predicate would add a name for a
  one-line condition.

- **The macOS shift+arrow nudge** (#5236, 1,293 added lines across
  `DraftNudge.swift`, `NativeCalendarRootModel+FocusedEventNudge.swift` and
  `EventEdgeNudgeBridge.swift`). Large, but it is a new feature with 819 lines
  of that total in two new test suites, and `DraftNudge.swift` is pure
  computation the model delegates to rather than a layer over existing code.
  New code, not debt; a sweep the week after a feature lands is the worst time
  to judge its shape.

- **`.github/scripts/` XCTest exit detection** (#5239). Three shell scripts
  including a self-test and a captured failure sample. Load-bearing mess of the
  `rolling-backend.sh` kind: `swift test` exit codes and log formats are the
  ugly part, and the self-test pins the detector against a real 43186705883 log.

## 2026-11-12

Swept the 18 merges that landed after the 2026-11-11 sweep (#5098, #5111, #5218
to #5224, #5228 to #5238); #5217 was that sweep's own finding and is excluded as
its output. Gate step 1 was clean: `bun knip` reports no unused files or exports
(only four config hints), `bun lint` passes every rule, `bun type-check` passes.
One finding, shipped as the zone-less-primary fix in the macOS
`CalendarTimeZoneHint` mirror. Everything below was examined and kept.

- **The day-view column fallback chain, web vs macOS** (#5229, #5232).
  `DayCalendarColumns.swift` resolves its no-events fallback as "first primary,
  then first ordered calendar", while web's `getDayViewCalendars` goes through
  `getDefaultTargetCalendar`, which additionally requires the primary to be a
  *writable provider* calendar and falls back to the local calendar before the
  first ordered one. So a user whose primary is read-only gets a different
  single fallback column on each platform. Real, but not a sweep's to settle:
  mirroring web needs `isWritableProviderCalendar` and `getLocalCalendar`
  semantics CompassKit does not model, which is a contract decision, and #5232
  is a same-day parity follow-up to #5229 that extends rather than reworks it.
  Flagged for a human instead.

- **`EdgeFocusHint.swift` mirroring `edge-focus-hint.parts.ts`** (#5231).
  The three `modeAnnouncements` strings and the `Tab` keycap are restated as
  Swift literals where web derives them from `KEYMAP.edgeFocus.hotkey`. Inherent
  duplication of the `remainderMasterId` kind (2026-11-10): CompassKit cannot
  import `@compass/core`, and the two sides render different shapes anyway
  (keycap parts vs prose). Landed today and still being extended by #5234;
  not a lead.

- **`wholeEventMoveKeys` hardcoding the timed arrow list** in
  `edge-focus-hint.parts.ts` (#5231), beside `edgeMoveKeys` deriving its timed
  case from `KEYMAP.moveEvent.timedEdgeKeycaps`. Looks like the `WEEKS_PER_ROW`
  shape, but there is no owning export being drifted from: `KEYMAP.moveEvent`
  publishes `keycaps` (a two-key teaching list) and `timedEdgeKeycaps`, not the
  five-key whole-event list. Naming one to remove a one-line literal is a fix
  larger than the problem.

- **The sub-hour relative-time copy change** (#5098). Touched 13 files across
  web and Swift to say "min" instead of "minutes", including three `connect`
  copy modules. Wide but mechanical, and the shared copy already lives in one
  module per surface.

- **`self-host/rolling-backend.sh` drain probe** (#5220, #5222). 93 added lines
  of shell with a bounded probe loop and a posix-safe status readback. Load-bearing
  mess of the `date-picker-keyboard-dom.util.ts` kind: ugly because `/bin/sh`
  portability and container draining are ugly. Four new `.test.sh` suites pin it.

- **`sync-token-unsupported` throttling** (#5218, #5219). Adds a snapshot
  throttle and an etag probe normalizer next to the 2026-11-11 entry's retry
  constants. Extends that area rather than restating it; the constants are still
  imported, not re-literalled.

## 2026-11-11

Swept the 9 merges that landed after the 2026-11-10 sweep (#5209 to #5216 plus
#5177); #5207 was that sweep's own finding and is excluded as its output. Gate
step 1 was clean: `bun knip` reports no unused files or exports, `bun lint`
passes every rule, `bun type-check` passes. One finding, shipped as the shared
subscription renew window (`DEFAULT_RENEW_BEFORE_MS`). Everything below was
examined and kept.

- **The duplicated observation guard on the RSVP claim path** (#5213).
  `host-guest-rsvp-notice.service.ts` short-circuits when the latest
  observation already equals `noticedObservationId`, and
  `stampNoticedAt` rejects the same pair again in the repository. Two
  statements of one predicate, which normally reads as debt, but this is
  deliberate depth on a concurrency path: the repository guard is the
  authoritative one (it sits in front of the CAS filter), the service one only
  saves a round trip. They cannot drift into harm, because the authoritative
  copy is the one that decides. Removing either reopens the double-claim bug
  #5213 and #5214 were written to close.

- **`SYNC_TOKEN_UNSUPPORTED_RETRY_AFTER_MS` beside
  `WATCH_UNSUPPORTED_RETRY_AFTER_MS`** (#5212). Both are 24h, and
  `clearSyncTokenUnsupportedByConnection` is a near-exact parallel of
  `clearWatchUnsupportedByConnection` with a different field. Shared shape, not
  shared intent: one is the re-probe cadence for a push channel the provider
  refuses to open, the other for a calendar whose sync tokens never survive.
  They can plausibly diverge (a token re-probe is cheaper than a watch call),
  so folding them into one constant or one generic clear would couple two
  independently tunable knobs. Both are already imported from
  `sync-token-unsupported.ts` at their use sites rather than restated as
  literals, which is the part that would have mattered.

- **#5213 and #5214 as a pair.** Two same-day PRs hardening one claim path look
  like churn, but #5214 extends #5213's watermark CAS to `modifiedCount` and
  adds a parallel-stamp stress test rather than reworking it. Not a sweep lead.

- **Three private overflow-clipping predicates in web.**
  `date-picker-keyboard-dom.util.ts` (per-axis scroll container),
  `shift-hint-visible-rect.ts` (`isClippingOverflow`, per-axis clip rect) and
  #5211's new `clipsOverflow` / `descriptionLinkChromeBoundary` (combined
  overflow, nearest clipping ancestor) each inspect computed overflow. None is
  a shared export the others re-implement, and the three want different
  semantics, so there is no owning module being drifted from. Left alone, and
  noted here: if a fourth copy appears, the right move is to name an owner
  once, not to fold these three.

- **`AsyncTestGate.waitForTest` / `AsyncTestSignal.waitForTest`** (#5216,
  `StoreTestsSupport.swift`). Two near-identical timeout wrappers around a
  throwing task group. A shared generic helper is roughly the size of the
  repeat it removes, and the file is mid-change: #5215 and #5216 both hardened
  it inside two days. Swift test support, no production path.

- **#5211's floating link chrome.** `size()` middleware plus an ancestor walk
  against `@floating-ui` and browser overflow. Load-bearing mess of the
  `date-picker-keyboard-dom.util.ts` kind: ugly because clipping is ugly.
  Touch only for a real defect.

## 2026-11-10

Swept merges after #5187 (2026-11-09 afternoon through #5197). One finding,
shipped as #5201 (`HostGuestRsvpSummarizeReplySchema` and the detector now
use `RsvpResponseStatusSchema` instead of a parallel three-value enum and
Set). Everything below was examined and kept.

- **Date-picker hint cluster** (`EventFormDateField.tsx`,
  `LifeBirthDateField.tsx`, `date-picker-keyboard-dom.util.ts`,
  `contextual-hint-tiers.ts`, sidebar month-picker hints from #5195). Off
  limits under the 30-day churn guard. Prior sweeps already split key
  semantics from form closed-field behavior and named the keyboard-DOM
  helper as load-bearing mess.

- **Timezone city search** (`city-timezone-search.ts`, web catalog, macOS
  `CityTimezoneSearch.swift`). Web imports the core search; native consumes
  the exported JSON index. Swift's Florida-only multi-zone caption is a
  platform port, not a silent copy of `US_STATE_NAMES`. Widening it would
  change macOS copy.

- **Event color merge** (`merge-editable-content-color.ts`). #5189 already
  owns the rule in core; web optimistic merge and sync `mergeUpdateContent`
  call it. Native draft mapping is a generated-payload port, not a second
  TypeScript copy.

- **Focus chrome contrast** (`calendar-accent.util.ts`,
  `GridEventFocusChrome.swift`). `LIGHT_PAGE_PAPER` and the two `3` floors
  sit in the owning web module next to each other; Swift reimplements WCAG
  math because it cannot import the web helper. Folding the two `3`s is
  taste. Touch only for a real contrast defect.

- **Reflection send time vs copy.** `reflectionSendAt` uses `10:30`;
  Settings and welcome copy say "10:30 a.m." Schedule time and user-facing
  cadence copy can change independently, same as the section-cap judgment
  on 2026-11-09.

- **Copy/paste placement** (#5194). Web `paste-placement.util.ts` and macOS
  paste-preview stores are platform parallels with different draft models.

- **Booking claim limiter** (#5193 / #5196). `scope` is already gone;
  guest RSVP and new-meetings keep separate limiter instances because a
  claim on one must not suppress the other.

- **Guest RSVP observation record** uses `AttendeeResponseStatusSchema` on
  purpose: storage is the detector's output plus identity fields. Tightening
  it to RSVP-only would be a schema change without a current write that
  needs it. The HTTP claim schema stays aligned with that stored shape.

- **CI macOS queue** (#5197). Workflow config, not domain duplication.

- **Prior sweep output.** #5184, #5186, #5187, #5191, #5196 are finished
  work, not leads.

## 2026-11-10

Swept the 17 merges that landed after the 2026-11-09 sweep (#5189 to #5206).
Gate step 1 was clean: `bun knip` reports no unused files or exports, `bun lint`
passes every rule, `bun type-check` passes. One finding, shipped as the macOS
occurrence-id separator fix (`ProjectRecurringEdit.swift`). Everything below
was examined and kept.

- **Hand-rolled SHA-256** (`packages/core/src/util/sha256-hex.util.ts`). #5200
  replaced `node:crypto` in `series-split.ts` with a 95-line SHA-256 so #5204
  would not pull a crypto polyfill onto the web boot graph. Reimplementing a
  primitive looks like debt, but the constraint is real (the function is
  synchronous, used in optimistic client paths, so `crypto.subtle` cannot
  serve it) and the file is pinned by known-true vectors. Fuzzed against
  `node:crypto` over 2,415 inputs (block and padding boundaries, multi-byte
  UTF-8, random): zero mismatches. Keep.

- **`remainderMasterId` mirrored in Swift** (`SeriesSplit.swift` via CryptoKit).
  Two implementations of one rule, which is normally the strongest debt class,
  but the duplication is inherent: CompassKit cannot import `@compass/core`.
  Closed mechanically instead, by pinning the same vector on both sides, so
  the mirror can no longer drift silently.

- **Residual: the timed fallback in `recurrenceIdString`.** The web normalizes
  a non-composite id's recurrenceId with `new Date(start).toISOString()`; Swift
  returns `payload.start.rawValue` as stored, and for an all-day event returns
  a bare date where the web returns `${start}T00:00:00.000Z`. Reachable only
  when an occurrence carries no composite id. Normalizing needs a date-parsing
  decision on the Swift side and changes behavior, so it belongs to a human,
  not to a sweep.

- **The macOS demo id convention.** `DemoSeedFixture.swift` composes local
  occurrence ids with `|` while `LocalEventExpansion` and `LocalOccurrenceKey`
  use `::`. Converting the demo seeder would touch its UI-test launch args and
  six test files and would change what a demo store holds. That is a contract
  decision, not debt a sweep may settle: the split projection now reads both
  formats and only ever mints the canonical one.

- **#5204 and #5205 as a pair.** Two same-day PRs on one split path look like
  churn, but #5205 extends the repointing to the remainder master rather than
  reworking #5204. Not a sweep lead.

## 2026-11-09

Swept 2026-11-02 to 2026-11-09, 50 merges. One finding, shipped as #5187
(`WEEKS_PER_ROW` in the life PDF grid). Everything below was examined and
kept.

- **`providerVersion` normalization** (`packages/sync/src/storage/contracts/`,
  `event.repository.ts`). Converged on a shared
  `NullableProviderEventVersionReadSchema` used by both `EventReadSchema` and
  `DeletionMarkerReadSchema`, with the legacy-empty rationale in comments.
  #5146 already did the sharing; #5121, #5126 and #5128 are the history of
  getting there, not leftover duplication.

- **Date-picker key utils** (`date-picker-keys.util.ts`,
  `eventFormDateFieldKeys.util.ts`). The split is deliberate and is the point
  of #5184: the first owns key semantics shared with Mac parity, the second
  owns closed-field behavior that needs the form's text and committed date.
  They change for different reasons. Folding them recouples the event form to
  the picker.

- **`date-picker-keyboard-dom.util.ts`**. Load-bearing mess. CSS-class
  queries, `requestAnimationFrame`, and a bounded 8-iteration scroll loop
  against `react-datepicker` internals and browser scroll behavior. Ugly
  because the problem is ugly. A tidier version that regresses keyboard focus
  or scroll reveal is a net loss. Touch only for a real defect.

- **`reflection-life-image.ts` typography churn**. Six PRs in the window
  (#5154, #5156, #5158, #5163, #5166, #5169) iterating header, footer,
  legend, and type on a 132-line SVG renderer. That is visual design
  iteration on a product surface, not structural debt.

- **`renderReflectionLifePng` exported for tests only.** Used by
  `renderReflectionLifePdf` and the test file. Keeping the SVG, PNG, and PDF
  layers independently testable is worth one export; `knip` agrees it is
  consumed.

- **Section caps of 3 in `reflection-content.ts`.** `recent.slice(0, 3)`,
  `upcoming.slice(0, 3)` and the memories cap look like one repeated
  constant, but the selector's cap bounds work and the renderer's bounds
  display. Naming them as one constant would couple two independent product
  decisions.

- **Repo-wide.** `bun knip` reports no unused files or exports; `bun lint`
  passes every rule, including the Tailwind semantic-color, barrel, and
  locator checks.
