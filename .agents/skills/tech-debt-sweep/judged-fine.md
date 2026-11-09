# Judged fine

Areas a tech-debt sweep examined and deliberately kept, with the reason.
Append only; newest block first. Read this before proposing anything.

An entry closes the question until that code's **behavior** changes. A new
sweep does not re-open one because it would have decided differently, or
because the code still looks the way the entry says it looks. If an entry is
genuinely wrong, say so to the user rather than quietly re-litigating it.

Format: one `##` block per sweep date, one bullet per area, each naming the
reason it stays.

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
