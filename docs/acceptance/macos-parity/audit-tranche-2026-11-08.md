# macOS web parity audit tranche (2026-11-08)

Agent branch: `cursor/mac-f-preview-audit-afc2`. Runtime proof for native behaviors remains GitHub macOS CI; this VM cannot execute XCTest.

## Concurrency ownership (do not duplicate)

| Owner | Branch / PR | Scope |
| --- | --- | --- |
| bc-9c7c2aa7 | PR5179 `cursor/life-keycap-datepicker-ux-0084` | Life/year picker, shared hint, Shift+Arrow; bugs: all-day then Shift+C, draft title dark field, pointer toast, W stuck day view |
| bc-4b340ecc | #5177 wide AX, #5181 description digit links (PASS, unmerged) | Do not re-land digit-link work; wide AX still open |

## Classifications

| Item | Class | Severity | Web reference | Native repro / source |
| --- | --- | --- | --- | --- |
| Bare `f` event-jump latch | **Defect fixed this tranche** | P0 keyboard | `e2e/timed/shift-hold-event-hints.spec.ts`, `useShiftHoldEventHints` keydown on `f` | `NativeGridKeyboardRouter` omitted `.focusShiftHold` from `handlerIds`; `performShortcut` never ran |
| Meeting type editor native | **Intended** | N/A | Web-only product scope | No native editor by design |
| `desktop-web-parity-checklist` row `focus-shift-hold` marked ✅ | **Stale accounting** | P2 docs | Checklist §3.3 | Marked pass without router registration; inventory row `focus-shift-hold-f` tracks real state |
| Wide AX reliability #5177 | **Unverified / owned** | P1 a11y | Web grid semantics | bc-4b340ecc; not resolved |
| PR5179 keyboard regressions | **Owned elsewhere** | P0–P1 | Shift+C all-day, W view | bc-9c7c2aa7 |
| Week geometry / signed-in RSVP / visual gates | **Unverified** | P1–P2 | `inventory.json` behaviors | Parent #4783; checkpoint.md gates open |
| Hold-F flash hints (`HoldModifierDetectorFactory.eventJumpHold`) | **Unverified optional** | P3 | Web uses tap latch, not hold flash | Factory exists; not wired in router (intentional defer unless product wants flash) |

## Tranche 1 (this PR)

- Register `focus-shift-hold` on grid shortcut dispatcher.
- `NativeGridKeyboardRouterEventJumpTests`: f activates mode + quick-time hints, form text-input gating, Esc dismiss.

## Tranche 1b (city timezone search — separate PR)

- **User report (2026-11-08):** Second timezone picker, typing `tampa`, no results.
- **Architecture:** `city-timezones` (MIT, ~7k cities) in `@core/timezone/city-timezone-search`; merged into web `filterTimeZones`; `city-timezone-index.json` via `desktop:export` for `CityTimezoneSearch.swift`.
- **Florida:** US state query prefers US rows; surfaces both `America/New_York` and `America/Chicago` with span note.
- **Limits:** City data is population-weighted geonames-derived; typos/obsolete names may miss; no live external API.

## Tranche 2 (prioritized next, not in this PR)

1. bc-9c7c2aa7 bug fixes after merge/conflict review (NativeGridKeyboardRouter overlap: day jump vs event jump only).
2. Keyboard parity sweep: `create-allday` tip strip 🟡, Esc/Enter per-surface (`shortcuts.md`).
3. Week view layout behaviors in `inventory.json` still `missing` (runtime geometry).
4. Signed-in RSVP persistence (`rsvp-live` missing).

## Blockers for independent review

- Native XCTest and strict macOS workflow must run on exact PR head after push.
- Linux `bun run verify` covers web/scripts; Swift tests require CI.
