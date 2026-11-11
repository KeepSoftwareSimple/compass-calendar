# Weekly reflection email implementation plan

Status: implementation plan, November 2, 2026. No delivery is enabled by this document.

## Private-trial presentation update, November 5, 2026

The current trial uses a plain email titled `Weekly review (ISO week)`, compact
section/date headings and year-only memory labels. Counts and highlights deduplicate
matching cross-calendar facts. The Life View PDF uses Rubik Regular and SemiBold, a two-column title/quote
header, the weekly grid, and a centered clickable `/life` link in the footer.
Percentage progress stays in the email body only. This supersedes the earlier PNG/CID and
completed-week-count presentation below. Private delivery is daily at 10:30 a.m.
America/Denver for the bound trial account; public rollout remains disabled.

## Agreed product behavior

Give users a short, useful reflection they can enjoy entirely in their inbox,
then invite them to make time for something in Compass.

- Production: Sunday at 10:30 a.m. in the user's saved IANA timezone.
- Sunday recap: **Your week so far**, from Monday at local midnight through
  the scheduled Sunday send time. Preview the upcoming Monday through Sunday.
  Events later on the current Sunday may appear as a separate short bridge,
  never as events that have already happened.
- Private trial: daily at 10:30 a.m. in `America/Denver`, observing DST.
  Recap the preceding seven days and preview the next seven days, with explicit
  dates and midnight boundaries, so no date appears in both sections. Trial recipient and confirmed birthday have
  been supplied separately; seed them through private operator configuration,
  not source-controlled fixtures or production-wide defaults.
- Trial uses the real account's calendar data and is restricted to its immutable
  user ID and designated address. No synthetic account or welcome-email preview
  loop. Approval of this plan does not enroll the general user base.
- Broader delivery remains behind the staged rollout gate. New onboarding
  recipients are enrolled automatically, receive their first review as email
  5/5, and can pause or re-enable reviews in Settings > Notifications. Existing
  accounts are not automatically enrolled. Browser initialization saves the app
  timezone; a signup that never opens the web app falls back to UTC.
- Regular Sunday delivery starts after the introductory review. It requires
  complete available history. The onboarding review can use partial history
  and says when history is still being prepared.
- Use calendars enabled in Compass; exclude hidden, declined, canceled, and
  deleted events. Deduplicate copies where shared event identity is available.
  Do not merge unrelated events merely because titles and times match.
- Start with deterministic factual highlights, not AI-generated interpretation.
  Describe what was on the calendar, without claiming attendance or feelings.

Email order:

1. Up to three recent highlights and one defensible observation, if available.
2. Up to three historical memories, favoring distinctive events over routine
   recurrences. Search the equivalent week in every available prior year first;
   if fewer than three useful candidates exist, supplement from the same month
   in prior years. Label week and month matches accurately, with original dates.
   Omit the section if no worthwhile candidates exist.
3. Life View PNG, exact completed-week count in the body, and one quote from
   the existing Life View collection. Start with a gentle curated subset.
4. Upcoming commitments, one practical reflection prompt, and a visible plain
   URL opening the appropriate upcoming week in Compass.

Keep the body short, aiming for a two-minute read. An empty calendar is not a
failure; do not infer that an unscheduled person was inactive. During the daily
trial, prefer a different memory when another suitable one exists. Selection
must be stable across retries of the same edition.

## Existing code and gaps

- `packages/sync/src/domain/calendar-import.service.ts` already performs a
  fast windowed pass followed by a checkpointed nominal full pass. Reuse it.
- Google omits date bounds for its full pass. Apple's
  `fullHorizonWindow()` still uses `syncHorizon()`. Microsoft's unwindowed
  request still supplies a horizon-derived `startDateTime`. A cursor alone
  therefore cannot certify all-history coverage across providers.
- `packages/sync/src/domain/horizon.ts` materializes occurrences only from
  12 months ago through 18 months ahead. A full canonical import does not make
  old recurring occurrences available through this read model.
- Web Life View preferences are browser-local in
  `apps/calendar-web/src/views/Life/life-preferences.storage.ts`. Native has
  its own persisted `CompassData/.../Stores/LifeStore.swift`.
- Life math, quote collection, and visual layout currently live under the web
  Life view; native has a corresponding `LifeMath.swift` and snapshot fixtures.
- Backend email delivery already has durable rows, claims, retries, suppression,
  unsubscribe handling, and webhooks. Its provider interface has no attachments;
  dispatch routes every sequence other than `booking-host` to welcome handling,
  and the poller currently depends on welcome-email enablement.

## Delivery sequence

### 1. Shared life settings and database persistence

Add concrete Zod v4 contracts under `packages/core` for life preferences and
reflection preferences. Store them on the Mongo user document, accessed through
authenticated user preference routes; do not add a second source of truth in
SuperTokens metadata. Keep life settings separate from email enrollment.

- Life settings: nullable date-only birthday, selected variation, lifespan
  value, and revision for conditional updates. Validate actual calendar dates
  and reject future birthdays. Persist date-only values without UTC shifts.
- Reflection settings: enabled/opt-in timestamp, timezone, and dedicated
  opt-out timestamp. Daily mode is an operator-only trial override, not a
  client-writeable rollout flag. Use the real account email, with a private
  trial override bound to the approved user ID.
- Move pure life math, average-reference metadata, and the quote collection
  into concrete core files used by web and backend. Native consumes generated
  contracts and parity fixtures. No backend import of web UI code.
- Use a versioned 79-year U.S. reference for the email and update the app's
  average preset. Preserve explicitly saved lifespan choices. Email always uses
  the average reference, rather than a random or custom lifespan; label the
  assumption so a user's other Life View modes are not silently changed.
- Database values win. On authenticated web/native startup, migrate valid
  explicitly saved local preferences only when database settings are absent,
  using an atomic initialize-if-missing operation. Confirm ambiguous placeholder
  birthdays rather than interpreting a default as a confirmed birthday.
- Keep anonymous/offline Life View working with a local cache. Scope signed-in
  cache data to the account, clear it on sign-out, and use revision checks so
  a stale cache cannot overwrite another device's newer settings. Do not persist
  temporary URL-selected views to the account as a side effect of hydration.
- Seed the trial's confirmed settings through a targeted operator command that
  resolves and displays the existing account before applying the private input.

Acceptance: settings survive another device/login; web, native, and the email
agree on the birthday and completed-week count for the same reference date.
Cross-account cache leakage and stale migration overwrites are covered by tests.

### 2. Verified historical import and historical reads

Keep this owned by `packages/sync`; the backend must not query Sync's Mongo
collections or contact calendar providers directly.

- Verify provider API semantics against official documentation and adapter
  tests. Make each adapter's full-history pass actually read all available
  historical singles, masters, and exceptions. Use provider capabilities;
  no provider-name branches in domain or web code.
- Reuse import/repair jobs, leases, pagination checkpoints, rate limits, and
  idempotent writes. Add a history-coverage version and per-calendar status
  (pending, importing, complete, attention), with completion timestamp and
  skipped-record diagnostics. Old rows default to unknown coverage, not complete.
- Backfill existing accounts with a bounded background sweep. Prioritize normal
  sync and user actions. Do not reset live incremental cursors to start a backfill;
  use the established repair/staged-generation mechanism and reconcile changes
  arriving during import before certifying completion. Fix provider adapter gaps
  before any repair is allowed to promote a supposedly complete generation.
- Include all available past data from calendars enabled in Compass. Newly
  enabled calendars invalidate the user's coverage gate until imported. Provider
  retention limits or inaccessible records are surfaced, never fabricated.
- Add a principal-scoped internal historical-read contract and backend client
  method. Query canonical singles and series in bounded batches and expand only
  the requested anniversary week/month windows using the existing recurrence
  engine. Apply EXDATEs, moved exceptions, cancellations, all-day semantics,
  event timezones, and overrides. Do not expand every recurring event across
  every lifetime week or change the interactive calendar horizon globally.
- Search every available prior year, with pagination/work limits and resumable
  background preparation when needed. Return coverage separately from candidates;
  hitting a work limit is not proof that older years have no events. Add indexes
  based on actual query shapes and verify behavior on a large-history fixture.
- Keep historical reads current after edits, deletions, reconnection, repair,
  calendar disablement, and account deletion. Respect tenant/principal isolation.

Acceptance: retrieve a single and a modified recurring occurrence more than a
year old; interrupted imports resume; live changes survive backfill; all three
provider adapters prove coverage. A failed/incomplete import never becomes an
empty-memory claim. Trial may send with an explicit incomplete-history notice;
general enrollment waits for verified coverage.

### 3. Reflection data and content

Implement a backend reflection context builder and pure content formatter under
`packages/backend/src/email`, using Sync contracts for calendar data.

- Freeze an edition's scheduled reference instant and timezone. Use local date
  boundaries rather than subtracting fixed 24-hour durations across DST.
  Production preview is next Monday inclusive through following Monday exclusive.
  Exclude ongoing events from claims about completed events.
- Anniversary matching uses the same month/day week interval in each prior year,
  with explicit leap-day and year-boundary rules. Rank across years rather than
  stopping once the nearest year fills the section. Month fallback deduplicates
  week results. Save selected memory identities on sent editions for repeat
  avoidance; unsent/failed editions do not consume a memory.
- Deterministic ranking can favor non-recurring events and descriptive titles.
  Do not invent semantic classifications from opaque titles. Avoid an arbitrary
  title blacklist that could discard meaningful repeated family events.
- Exclude holidays where calendar/event metadata identifies them. Treat all-day
  events separately from scheduled-hour observations; do not double-count
  overlapping intervals or label calendar gaps as guaranteed free time.
- Escape titles in HTML; omit descriptions, conference links, and attendee lists
  unless the feature later explicitly needs them. Preserve original event titles.
- Reuse an existing week route and its date search contract for the plain CTA
  URL. Verify sign-in preserves the destination; do not put private event data
  in links. Use first-party edition attribution if needed, without requiring
  redirect links or open tracking to deliver value.

Acceptance: deterministic fixtures cover rich/sparse/no history, fallback,
duplicate copies, declined/hidden/canceled events, all-day/multi-day events,
cross-year weeks, leap days, and DST. Counts are described as calendar facts.

### 4. Deterministic Life View PNG and attachment transport

Render the grid from shared life calculations, not an AI-generated image or a
production browser screenshot. Start with SVG primitives rasterized to PNG
using one small server-side renderer such as `@resvg/resvg-js`; verify Bun,
Docker architecture, fonts, and deployment packaging before adopting it.

- Match the app's 52 columns, completed-dot styling, year labels, and current
  week. Use an opaque email-friendly background and shared semantic palette
  values so text remains readable regardless of the email client's theme.
- Include a title, reflection date, exact completed-week count, legend, and
  labeled 79-year reference. Add an enlarged current-year strip that visibly
  distinguishes the most recently completed week from the current week.
- Target a roughly 600px readable display width, rendered at 2x resolution;
  check a 360px phone preview and the opened attachment. Aim below 500 KB.
- Derive progress from the birthday and edition reference date. Daily emails
  may show unchanged progress; a slot fills only when a real week completes.
  Test birthday boundaries, DST, and users beyond the reference lifespan. Clamp
  the grid without calling completed weeks beyond it "weeks remaining" or
  misrepresenting the actual completed-week count.
- Extend `EmailSendInput`, Resend transport, and log/test providers for filename,
  MIME type, base64 content, and optional content ID. Send a named PNG attachment
  and reference it inline using CID when supported. Verify actual attachment
  opening/saving behavior in clients; if inline disposition hides it, prefer
  a regular downloadable attachment over sending two duplicate images.
- Include body text and alt text explaining the count/reference. Generate the
  image privately; do not upload personal life grids to public image hosting.

Acceptance: image reviewed beside Life View for the same input; PNG opens on
mobile and desktop; Gmail/Apple Mail smoke checks confirm a readable body and
usable attachment. Provider payload tests cover CID and ordinary attachments.

### 5. Scheduling, delivery, and opt-out

Add `reflection` as an explicit email sequence and extend the existing queue.
Keep enrollment and dispatch gates separate from the welcome sequence; use an
exhaustive sequence switch instead of the current welcome fallback.

- Run a bounded scheduler in the existing backend polling lifecycle. Persist
  next-send UTC timestamps derived from the saved local timezone and cadence.
  Recompute using timezone rules, never by adding 24 hours or seven UTC days.
- Unique edition IDs are based on user, cadence, and local edition date. Reuse
  claim leases, retry/backoff, provider idempotency, suppression, and webhooks.
  One scheduled edition is enqueued across replicas and restarts.
- Freeze edition boundaries and persist the prepared content/image snapshot
  for consistent retries within the existing email retention policy. Recheck
  account, enrollment, recipient, and suppression immediately before sending.
  If source data becomes ineligible while queued, cancel that prepared edition
  rather than sending disabled/deleted calendar content.
- Trial fail-closed gate checks both approved user ID and designated address
  at enrollment and dispatch. Empty trial configuration never means everyone.
  Resolve a real account; do not create a synthetic user as a fallback.
- Expire an unsent edition at local noon; do not replay days of missed morning
  emails after an outage. Recheck expiry on retries. Provider acceptance before
  expiry counts as that edition's send, even if later delivery is delayed.
- Add reflection-specific unsubscribe UI and one-click handling, while honoring
  global suppression. Preserve existing welcome and booking opt-out semantics.
  Turning reflection off cancels queued reflection rows and suppresses the
  onboarding review. Re-enabling after a pause requires an explicit action.
  Offer optional email feedback after unsubscribing. Birthday is optional for
  enrollment; omit the life image if
  unconfirmed rather than making up a birthday.
- Logs/analytics record sequence, edition, coverage, durations, delivery outcome,
  and skip reason without birthday, event titles, or PNG/base64 data.

Acceptance: concurrent schedulers/restarts and ambiguous provider responses do
not duplicate delivery within provider idempotency guarantees. Test Sunday,
DST transitions, timezone changes, late retries, opt-out during preparation,
bounce/complaint suppression, deleted accounts, and an unauthorized recipient.

### 6. Private trial, then staged onboarding rollout

1. Ship preference migration and provider history fixes with reflection delivery
   disabled. Verify existing calendar/auth/email flows still work.
2. Run the targeted account seed and history import. Generate an unsent preview
   (HTML, text, PNG) from actual account data for review, outside the repository.
3. Enable only the approved daily trial. Review accuracy, memory usefulness,
   attachment legibility, and whether the reflection helps plan the next week.
4. Improve selection/template using trial feedback. Verify a Sunday edition
   separately because the daily trial uses different date windows.
5. After the user's trial approval, enable automatic enrollment for the new
   onboarding cohort. Expand only after reviewing import load, queue health,
   delivery failures/complaints, and qualitative usefulness. Do not auto-enroll
   existing accounts.

Provide operator commands for coverage inspection/backfill, render-only preview,
trial enable/disable, and queued-edition cancellation. Reuse the existing CLI
and configuration patterns rather than introducing a new admin application.
Keep a global reflection kill switch; disabling delivery must not stop calendar
sync. Account deletion removes reflection settings/prepared personal artifacts.

## Verification and implementation boundaries

Deliver phases 1 and 2 independently, followed by content/rendering and delivery,
then rollout controls. Keep each change reviewable; no new service or generic
campaign framework is needed. A phase is not complete until its acceptance
checks pass. All phases required for general rollout must be finished before
enabling general enrollment; the private trial has its explicit history exception.

Run focused core/web/backend/sync/scripts suites for the changed boundaries,
including Mongo-backed import, preferences, and queue tests. Keep regression
tests. Run `bun run verify --strict` before shipping. Native changes also require
`bun cli contracts:swift --check`, `bun cli desktop:export --check`, and the
focused LifeStore/LifeMath tests. Perform visual image/email QA separately from
automated checks. Rehearse on staging before any production activation.

## External references

- [CDC: Mortality in the United States, 2024](https://www.cdc.gov/nchs/products/databriefs/db548.htm):
  79.0-year life expectancy at birth for the total U.S. population. Store source
  year with the reference; describe it as a visualization assumption, not an
  individual prediction. No runtime statistics lookup is needed per email.
- [Resend: Embed images using CID](https://resend.com/changelog/embed-images-using-cid):
  inline attachment support using `content_id` and `cid:` references. Verify
  downloadable-attachment behavior in actual clients during implementation.
