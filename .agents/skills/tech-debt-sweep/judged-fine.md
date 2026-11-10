# Judged fine

Areas a tech-debt sweep examined and deliberately kept, with the reason.
Append only; newest block first. Read this before proposing anything.

An entry closes the question until that code's **behavior** changes. A new
sweep does not re-open one because it would have decided differently, or
because the code still looks the way the entry says it looks. If an entry is
genuinely wrong, say so to the user rather than quietly re-litigating it.

Format: one `##` block per sweep date, one bullet per area, each naming the
reason it stays.

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
