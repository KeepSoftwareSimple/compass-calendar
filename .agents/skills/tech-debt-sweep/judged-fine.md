# Judged fine

Areas a tech-debt sweep examined and deliberately kept, with the reason.
Append only; newest block first. Read this before proposing anything.

An entry closes the question until that code's **behavior** changes. A new
sweep does not re-open one because it would have decided differently, or
because the code still looks the way the entry says it looks. If an entry is
genuinely wrong, say so to the user rather than quietly re-litigating it.

Format: one `##` block per sweep date, one bullet per area, each naming the
reason it stays.

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
