# Native macOS ↔ web parity checklist

Tracking issue: [#4331 Native web-parity dogfood gate](https://github.com/KeepSoftwareSimple/compass-calendar/issues/4331).

This checklist compares **apps/calendar-web** (reference UI) with **apps/calendar-macos** (native Swift). Status keys:

| Status | Meaning |
| --- | --- |
| ✅ | Matches web behavior and styling closely enough for dogfood |
| 🟡 | Partial: core behavior works, visual or edge-case gaps remain |
| ❌ | Missing or materially different |
| 🔧 | Shared contract exists; fix is mostly wiring or SwiftUI/AppKit polish |

**Sources of truth**

- Semantic **colors**: `apps/calendar-web/src/index.css` → `bun cli desktop:export` → `CompassKit/Generated/ThemeTokens.swift` (22 roles; guarded by `theme-css.test.ts` and `desktop:export --check`).
- **Shortcuts registry**: `packages/core/src/shortcuts/shortcuts.registry.ts`, `KEYMAP`, `APP_SHORTCUT_BINDINGS` → `CompassKit/Resources/shortcuts.json` + `ShortcutIds.swift`.
- **Layout math / fixtures**: exported JSON replayed in `CompassKitTests` / `CompassDataTests`.
- **Manual acceptance**: [Desktop acceptance](../acceptance/desktop.md), [Shortcuts](../acceptance/shortcuts.md).

---

## 1. Design tokens

### 1.1 Colors (themes, accent, event fills)

| Item | Web | macOS | Status | Notes |
| --- | --- | --- | --- | --- |
| Light Beach / Dark Abyss palettes | `[data-theme]` in `index.css` | `ThemeTokens.lightBeach` / `darkAbyss` | ✅ | Generated from same CSS |
| SwiftUI accessor coverage | Tailwind `color-*` for all 22 roles | `NativeWebTheme` exposes all roles on `ThemeTokenColor+SwiftUI.swift` | ✅ | `NativeWebTheme` exposes all 22 generated palette roles, including raised surfaces, strong borders, accent variants, on-accent text, info and shadow |
| Panel modal backdrop | `OverlayPanel` / `bg-background/85` + `backdrop-blur-sm` | `PanelBackdropView`: `panelBackdropColor` (`background` @ 85%) over a within-window blur | ✅ | Settings and welcome used the dark `overlayBackdrop` dim and read as solid gray; that dim stays for menus and confirm dialogs. Welcome centers vertically like web |
| Event default fill hex | `theme.util.ts` / deck | `EventCardView.swift` literals `#454442`, `#82A0B2` | 🟡 | Values align; not read from tokens |
| Event focus ring color | `--event-focus-color` + outline | `EventCardView` CALayer border from fill-aware helper | 🟡 | Same intent, different paint model |
| Holiday / gradient accents | CSS gradients on chips | Mostly solid fills | 🟡 | Audit per calendar color id |
| Block Party slot colors | Web game CSS | `BlockPartyColor.swift` hardcoded RGB | 🟡 | Intentional game palette; not semantic tokens |

### 1.2 Typography

| Item | Web | macOS | Status | Notes |
| --- | --- | --- | --- | --- |
| Font family | Rubik (`index.css` `@theme`) | `Resources/Fonts/Rubik-Variable.ttf`, `.rubik()` | ✅ | Fixed XcodeGen packaging: the previous resource declaration omitted every font from the built app, causing system fallback. Font files now appear in the built bundle; fresh local launch inspected. Broader typography and layout acceptance remains partial |
| Base size 14px | `text-sm` / body | `RootView` `.font(.rubik(14))` | ✅ | |
| Scale (10–20px utilities) | Tailwind `--font-size-*` | Per-view hardcoded point sizes | 🟡 | No shared typography export yet |
| VT323 / Caveat (special) | Web where used | Bundled fonts | 🟡 | Spot-check Life / onboarding |

### 1.3 Spacing, radii, borders

| Item | Web | macOS | Status | Notes |
| --- | --- | --- | --- | --- |
| Main content `pl-8` | 32px | `contentLeadingInset` 32 | ✅ | `RootView.swift` |
| Sidebar width / divider column | `SIDEBAR_DIVIDER_WIDTH` | `sidebarDividerWidth` 32 | ✅ | |
| Sidebar **leading** border full height | 1px `border-border`, no horizontal rules in body | `Rectangle` 1px on sidebar leading edge | ✅ | Tyler: avoid extra horizontal dividers inside sidebar |
| `--radius-default` / `rounded-xs` | `index.css` `@theme` | Mixed 4/8/12 in SwiftUI | 🟡 | Palette panel 12; save bar should be `rounded-xs` (~4) |
| Grid hour lines | `border` alpha 15% / 12% dark | `TimeGridStyleTests` | ✅ | |
| `--border-strong` | Strong dividers when needed | Rarely used in SwiftUI | 🟡 | |

### 1.4 Shadows

| Item | Web | macOS | Status | Notes |
| --- | --- | --- | --- | --- |
| `--shadow-default` on elevated buttons | `c-button-elevated` | Limited native elevation | 🟡 | Save bar / primary buttons |
| Command palette panel shadow | Floating overlay | Token-colored shadow, 28pt radius and 16pt vertical offset | ✅ | `CommandPaletteOverlay.swift`; native paint parameters remain platform-specific |

### 1.5 Focus rings

| Item | Web | macOS | Status | Notes |
| --- | --- | --- | --- | --- |
| Default interactive focus | `c-focus-ring`: 1px accent ring + 1px offset on `surface-panel` | Mixed: AppKit `.exterior`, custom strokes, `NoticeFocusRing` 2px no offset | 🟡 | Target: consistent accent border **without** fill color swap |
| Notice focus (`p`) | Focus moves into notice control | Banner `noticeFocusRing` on billing/demo/update | 🟡 | Web scans `[data-notice]`; native `NativeNotice` enum is smaller |
| Fields | `c-field` ring on focus | Per-control 1px stroke (e.g. description editor) | 🟡 | |
| Disabled system focus ring | N/A | Quick Add `focusRingType = .none` | 🟡 | Matches intentional web-like chrome |

**Token drift prevention:** Prefer extending `NativeWebTheme` from generated `ThemeTokens` rather than new literals. Optional follow-up: export radius/typography scales from CSS the same way as colors.

### 1.6 macOS unified title bar (intentional platform difference)

| Item | Web | macOS | Status | Notes |
| --- | --- | --- | --- | --- |
| Calendar nav + title + sidebar toggle | In-content header row (`CalendarHeader`, `h-12`) | Unified title bar beside traffic lights (`MacTitleBarChromeMetrics`) | ✅ | Compact 28pt band, 13pt system title and 14pt navigation icons. Local native regression passes, including title/nav alignment with the actual window close button |
| Parity screenshot grid region | Crop includes in-viewport header band | Regional grid crop starts at `mainContentTopInset` (44px); web crop skips 48px header | ✅ | `.github/scripts/compose-desktop-parity-shots.py` `grid_region_crop()` |

---

## 2. Surfaces

### 2.1 Week / day time grid

| Item | Status | Notes |
| --- | --- | --- |
| Deck layout / card frames | ✅ | Shared fixtures, `GridLayoutSnapshotTests` |
| All-day row above timed scroll | ✅ | `TimeGridView.renderAllDayColumns` |
| Now line position | ✅ | Shared now math |
| Now line **visual** (gradient + 1px rim) | 🟡 | macOS: accent gradient + 1px background rim (#4611); web shimmer timing still differs |
| Now-cue pulse on **`t`** (today) | 🟡 | Web 700ms label shimmer; macOS week header opacity pulse + day view switcher pulse |
| Click grid teaches shortcut | ✅ | Pointer hint overlay |
| Day labels | ✅ | Centered per column; number `clamp(18, 2.7cqw, 20.8)`, weekday `clamp(13, 2cqw, 16)` |
| Day column header focus | 🟡 | AppKit exterior ring vs web `c-focus-ring` |
| Shift+C all-day tip strip | 🟡 | Sidebar jump line animates; full web tip stack still partial |

### 2.2 Event chips

| Item | Status | Notes |
| --- | --- | --- |
| Timed / all-day card shell | ✅ | `EventCardView`, palette tests |
| Event jump chips (W1, SU2, ...) | ✅ | `DayJumpKeys` ports web `assignDayJumpKeys`: day prefix + per-day index on timed and all-day cards, narrowed to the typed day; digits after a day pick focus (400 ms wait for W1 vs W10); bare digits stay quick-time |
| Shift+M weekday column jump | ✅ | `handleShiftDayJump`; weekend Shift+S→U/A added; digit jump after a day pick wired; bare day letters in jump mode (F toggles off, E / C pass through, other letters swallowed like web); four digits typed within 800 ms after a day pick create on that column (Shift+T then 1230), like web's column time burst |
| Sidebar edit ring | 🟡 | Inset focus layer vs web outline |
| Unsettled outline | ✅ | Dashed `text-muted/50` outline on sample events and organized events with awaiting or tentative guests |

### 2.3 Sidebar event form

| Item | Status | Notes |
| --- | --- | --- |
| Replaces sidebar body while open | ✅ | `EventFormView` in `RootView` |
| Date field **MM.DD.YY** closed display | ✅ | `EventFormCompactDateField` shows 06.10.26 like web (compare run 39732173380) |
| Datepicker open Enter/Space/ArrowDown | ✅ | Closed field matches web `EventFormDateField`: ↓, Enter on the committed date, and Space on the shown date open the calendar; ↑ / Shift+↑ / Shift+↓ / Mod+↓ nudge the day (`EventFormDateFieldKeys`). Open calendar matches web `react-datepicker`: ← → move a day cursor, ↑ ↓ a week, Enter or Space picks, Esc closes only the calendar (`EventFormDateKeysTests` drives them). Like web, plain Return in a date field commits or opens instead of saving the form; ⌘ Enter still saves. Hints match web: a ↓ keycap inside the focused field and ↑ ↓ · Enter · Esc in the calendar header |
| Time pickers | 🟡 | The list opens centered on the selected time (or the quarter hour before it) like web. Still differs: macOS shows the list and the date picker as AppKit popovers that can open to the side of the field, while web drops them below it |
| Location / Meet / guests grouping | ✅ | #4607 single `EventFormCard` + description card (web #4599) |
| Color row keys and hints | ✅ | Like web `EventColorPicker`: trailing ⌘ 6 keycaps; once color has focus (Mod+6 or E then C) ← → move a focus ring, Space / Enter pick, pick keys 1-9 0 - = choose a swatch and show on each swatch (swatches in web `EventColorSlotSchema` order, lavender first), and the hint swaps to ← → · Enter. The demo capture also shows a guest row on macOS only: the demo fixture calendar can invite (UI tests need it), the real local calendar cannot |
| Save bar: accent fill, on-accent text, space-between, **⌘Enter** hint | 🟡 | macOS save bar matches accent + Mod+Enter keycap (#4610); sidebar shows web save-draft tip (#4614) |
| Mod+digit field jump + hold-Mod chips | ✅ | `ModHoldChipsOverlay`, layout snapshots; chips sit at the anchor's top-right corner like web `DigitHintChipOverlay` (top + 2px, flush right) |
| Hold-Mod day header keycaps (⇧SU, ⇧M, ...) | ✅ | Week headers swap the weekday for `WeekDayColumnHeaderControl` keycaps while Mod is held; bare letters in event-jump mode |
| Hold-Mod sidebar chips (month picker, Up next, calendar list) | ✅ | Anchors merge with nested ones, so the sidebar no longer hides the month picker and Up next chips; the calendar list digit sits on the list, not the sidebar corner. |
| Per-account page-jump targets | ✅ | One Mod+digit target per connected account heading after Up next, like web `buildCalendarPageJumpTargets`; a collapsed heading expands on jump; one "calendars" slot with no accounts |
| Sticky form actions row (icons + shortcuts) | 🟡 | Header keyboard behavior and shortcut help verified; exact icon/spacing parity still needs visual comparison |
| Close unchanged / edited event | ✅ | 2026-10-23: only changed existing events prompt, like web. Unchanged edits, reverted edits, and create drafts close immediately. Four model regressions pass; native tests verify Close prompts instead of saving edits, Cancel preserves them, and Shift+Escape discards without saving |
| Header actions keyboard focus | ✅ | Mod+0 focuses the first toolbar button after the parent releases title focus, including repeated jumps. Tab / Shift+Tab move through actions, Return / Space activate them, and shortcut help names the keys. Native screenshot inspection at 720×630 confirms a visible Close focus outline; three focused native regressions and full strict verification pass |
| Form duplicate undo / redo | ✅ | Form duplication records its create in undo history. Model and native tests verify duplicate → undo → redo without modifying the original |
| Calendar / recurrence / RSVP shortcut focus | 🟡 | [#4783](https://github.com/KeepSoftwareSimple/compass-calendar/issues/4783): source audit found these sections use `focusField` for a painted highlight without binding keyboard focus to their menu or buttons. Live acceptance and fixes remain, including signed-in RSVP |

#### 2026-10-22 popover and capture verification

Date and time pickers open below their fields in native user flows at both the normal window size and the canonical 1280×820 capture size. Date keyboard selection/Escape and time selection pass. Fresh exported images also show the popovers below their fields, correcting the earlier placement finding. Sidebar-only crops can cut off the portion of the calendar that extends over the grid.

Found a separate capture reliability defect with multiple installed Compass builds: generic debug URL opening can target another build, causing export timeouts. Capture helpers now activate the test target and route debug URLs to its running bundle path. The existing date/time capture checks assert placement and verify that export preserves the open picker and event form. Signed-in acceptance remains outstanding.


### 2.4 Mini-calendar (month picker)

| Item | Status | Notes |
| --- | --- | --- |
| Keyboard `i`, arrows, Enter | ✅ | |
| Mod+Alt+J / K / T month jump | ✅ | |
| Selected range / today styling | ✅ | Week mode bolds the selected week row with ink on today; 28.8pt circles; today follows the calendar clock; Go to this month circle hides on the current month |
| Weekday header 10px muted | 🟡 | Rubik 10 in `SidebarMonthPicker.swift` |

### 2.5 Up Next / Now panel

| Item | Status | Notes |
| --- | --- | --- |
| Projection + join URL | ✅ | |
| `N` / `V` shortcuts | ✅ | Registry + router |
| Shortcut hint on card (N/V keycaps) | 🟡 | Hover/focus keycap on native Up Next (#4614) |
| Bottom banner vs web notice stack | 🟡 | Fewer notice types on native |

### 2.6 Account list / calendars sidebar

| Item | Status | Notes |
| --- | --- | --- |
| Calendar list + digit hide/show | ✅ | |
| Anonymous row | ✅ | |
| Sync status line + shortcut footer | ✅ | |

### 2.7 Settings

| Item | Status | Notes |
| --- | --- | --- |
| Accounts, default calendar, timezone, theme | ✅ | WP-29 |
| Launch at login, global Quick Add | ✅ | macOS-only (expected) |
| Visual match to web settings overlay | 🟡 | Web background tint and 8pt blur verified locally in both themes; section spacing and navigation focus still differ |

2026-10-22: Settings uses the existing background tint at 85% opacity with a 8pt blur on the content behind the panel. Both-theme native tests verify outside-click and Escape dismissal. Native window captures show the blur; view-level parity exports render background compositing differently, so they do not establish full visual equality.

### 2.8 Onboarding / welcome

| Item | Status | Notes |
| --- | --- | --- |
| Welcome modal steps | ✅ | Both-theme click and keyboard regression passes locally and in CI (#4767) |
| Connect / first-event prompts | 🟡 | |
| Pixel pirate / illustration colors | 🟡 | Hardcoded in `PixelPirateView.swift` |

### 2.9 Notices / toasts / banners

| Item | Status | Notes |
| --- | --- | --- |
| Billing past due | ✅ | |
| Demo events, update ready | ✅ | |
| Meeting nudge, connect prompts, first-event | ✅ | Sidebar meeting-page nudge (`M`), local-mode trial card (`S`, Esc), first-event card completes on first create |
| Connection + timezone banners | ✅ | Reconnect / Retry / Refresh / Learn more (`G`); timezone mismatch Switch / Keep; Auto zone follows the Mac each minute |
| Status toasts | 🟡 | `StatusToastOverlay` vs web toast stack |
| Focus latest notice **`p`** | ✅ | Connection banner, sample events, meeting nudge, trial card, update, past due |

### 2.10 Command palette

| Item | Status | Notes |
| --- | --- | --- |
| Placeholder copy | ✅ | Same string |
| Go-to-date from query | ✅ | Shared parsing fixtures |
| Navigation / create / events / recent | ✅ | |
| Fuzzy search + highlight | ✅ | `CommandPaletteSearchLogic` mirrors `filterSections`; muted label with bold matches |
| Row icons (Phosphor) | 🟡 | SF Symbol row icons on navigation/more rows (#4613); not Phosphor |
| Keycaps (`ShortcutKeys`) | ✅ | One `ShortcutHintChip` per key, like web `ShortcutKeys` |
| Selected row ring inset | ✅ | Accent inset ring + lighter fill (web `ring-inset`) |
| **Missing rows** vs web | ✅ | Web section order and rows (Common Actions, Appearance, Settings, More); disabled rows dim and skip; notifications row is web-only (macOS uses system settings) |
| Footer hint | ✅ | Keycap chips for navigate / select / close |

### 2.11 Command palette (desktop quick-add variant)

| Item | Status | Notes |
| --- | --- | --- |
| Separate placeholder when creating from hotkey | ✅ | Both native Quick Add field implementations match web `DESKTOP_QUICK_ADD_PALETTE_PLACEHOLDER`: “Add an event, or type a time like 1130” |

### 2.12 Life view

| Item | Status | Notes |
| --- | --- | --- |
| Grid + sidebar | 🟡 | Founder visual QA noted on #4331 |
| Intro panel theme colors | ✅ | Surface fill and border match web Life intro overrides; primary text and shadows use semantic tokens. Both-theme native screenshots and Enter dismissal verified locally (#4764) |

### 2.13 Window chrome

| Item | Status | Notes |
| --- | --- | --- |
| Traffic lights + header | ✅ | `WindowChromeLayoutTests` |
| View switcher keycaps | ✅ | `ViewSwitcherView` |

---

## 3. Keyboard parity

Legend: **Mod** = ⌘ on macOS. Web bindings from `APP_SHORTCUT_BINDINGS` / `KEYMAP`; macOS from `shortcuts.json` unless noted.

### 3.1 Navigate

| ID | Binding | Web | macOS | Status |
| --- | --- | --- | --- | --- |
| `nav-up-next` | N | ✅ | ✅ | ✅ |
| `nav-join-meeting` | V | ✅ | ✅ | ✅ |
| `nav-previous` | J | ✅ | ✅ | ✅ |
| `nav-next` | K | ✅ | ✅ | ✅ |
| `nav-shift-left` | Mod+Shift+← | ✅ | ✅ | ✅ |
| `nav-shift-right` | Mod+Shift+→ | ✅ | ✅ | ✅ |
| `nav-month-prev` | Mod+Alt+J | ✅ | ✅ | ✅ |
| `nav-month-next` | Mod+Alt+K | ✅ | ✅ | ✅ |
| `nav-month-current` | Mod+Alt+T | ✅ | ✅ | ✅ |
| `nav-picker-step` | Arrow keys in picker | ✅ | ✅ | 🟡 telemetry |
| `nav-today` | T (keyup) | ✅ | ✅ | ✅ |
| `nav-go-to-date` | Mod+G | ✅ | ✅ | ✅ |
| `nav-scroll-*` | PgUp/PgDn, Mod+↑/↓ | ✅ | ✅ | ✅ |
| `nav-day-view` | D | ✅ | ✅ | ✅ |
| `nav-week-view` | W | ✅ | ✅ | ✅ |
| `nav-life-view` | L | ✅ | ✅ | ✅ |
| Life prev/next/current | ←/→, H | ✅ | ✅ | ✅ |

### 3.2 Create

| ID | Binding | Status | Notes |
| --- | --- | --- | --- |
| `create-timed` | C (keyup) | ✅ | |
| `create-allday` | Shift+C | ✅ | Tip strip parity 🟡 |
| `create-place-timed` | Shift+arrows | ✅ | |
| `create-typed-time` | digits in draft | ✅ | |
| `create-place-discard` | Esc (secondary TZ) | ✅ | |

### 3.3 Focus

| ID | Binding | Status | Notes |
| --- | --- | --- | --- |
| `focus-sidebar` | I | ✅ | Month picker |
| `focus-event` | U | ✅ | `focusFirstCalendarEvent()` seeds nearest grid event |
| `focus-shift-hold` | F (+ digits) | ✅ | Jump mode: W1 / SU2 chips, bare day letters, digits after a day pick, typed time on the picked column |
| `focus-week-day` | Shift+M… | ✅ | Column select + first event; weekend S→U/A; day-prefix digit targeting and typed-time creation wired |
| `focus-notice` | P | ✅ | Connection, sample events, meeting nudge, trial, update and past-due notices; see §2.9 |
| `focus-calendar-digit` | 1–9 in list | ✅ | |
| `focus-page-jump` | Mod+digit (hold hints) | ✅ | |
| `focus-find-event` | Mod+K | ✅ | Palette search |

### 3.4 Edit / clipboard / menu

| ID | Status | Notes |
| --- | --- | --- |
| `edit-open` | ✅ | Enter / E sequence |
| `edit-save` | ✅ | Mod+Enter saves; save button shows separate ⌘ and Enter keycaps |
| `edit-delete` | ✅ | |
| `edit-duplicate` | ✅ | |
| `edit-copy` / `edit-paste` | ✅ | |
| `edit-hide` | ✅ | |
| `edit-menu` | ✅ | Context menu |
| Arrow move focus | ✅ | |
| Shift+Tab cycle edge | ✅ | |
| Undo/redo | ✅ | Palette rows + Cmd+Z |

### 3.5 Other

| ID | Binding | Status |
| --- | --- | --- |
| `other-palette` | Mod+K | ✅ |
| `other-shortcuts` | ? (Shift+/ menu) | ✅ |
| `other-settings` | Mod+, | ✅ |
| `other-sidebar` | ] | ✅ |
| `other-time-travel` | (TZ dialog) | ✅ |
| `other-subscribe` | B (trial) | ✅ |
| Edit sequence E→field | ✅ | Leader engine |
| Esc / Enter / Mod+Enter semantics | 🟡 | Per-surface audit in [shortcuts.md](../acceptance/shortcuts.md) |

### 3.6 Tab order & visible keycaps

| Item | Status |
| --- | --- |
| Tab order through form fields | 🟡 |
| Keycaps on view switcher, footer, welcome | ✅ |
| Keycaps on save bar, Up Next, palette rows | ✅ |
| Which-key overlay | ✅ |

---

## 4. Automated parity coverage

| Layer | Catches |
| --- | --- |
| `desktop:export --check` | Colors, shortcuts JSON, Swift ids, fixtures |
| `CompassKitTests` | Layout, keyboard registry, go-to-date, recurrence, HTML, Block Party |
| `CompassUI` unit | Time grid style, now cue timing, event card palette |
| `CompassUITests` | Launch, palette keyboard, form save, snapshots (macOS CI) |
| Web `theme-css.test.ts` | CSS ↔ TS color roles |

**Visual automation:** `desktop-web-parity-screenshots.yml` captures web and macOS surfaces and produces side-by-side comparisons (see §7). These captures support visual review; they do not establish pixel equality or signed-in flow parity.

---

## 5. Suggested fix sequence (PRs)

1. **Tokens + typography accessors** — full `NativeWebTheme` roles; stop inverted save bar; optional `NativeFocusRing` helper.
2. **Event form** — MM.DD.YY date chip, save bar layout, schedule section grouping.
3. **Command palette** — missing commands, fuzzy highlight, keycap chips, row chrome.
4. **Grid** — now line gradient/rim, now-cue timing/shimmer, all-day tip strip.
5. **Keyboard gaps** — `focus-event` (U), Shift+M week-day focus, palette undo/redo.
6. **Event form logistics card** — match web #4599: one FormCard for Location, Add Google Meet, Add guests; Description in the following FormCard (not nested mini-panels).

Each PR should link a child issue, include before/after screenshots (web Chromium + macOS snapshot or manual), label `agent-automerge`, and pass macOS workflow on GitHub runners.

---

## 6. Changelog

| Date | Change |
| --- | --- |
| 2026-10-19 | Initial audit checklist for #4331 dogfood gate |
| 2026-10-19 | §7 visual evidence table (web CI captures; macOS/compare pending runner) |
| 2026-10-19 | §7 updated from workflow run 39299882448 (macOS + compare artifacts) |
| 2026-10-19 | §5 queue: event form logistics grouping (web #4599); CI fixes on main (palette Range, e2e/parity shard) |
| 2026-10-19 | §7 from workflow run 39327804343 (#4607 branch): macOS capture + compare artifact; logistics card on event form |
| 2026-10-20 | Palette: web sections, rows, disabled state, keycap chips |
| 2026-10-20 | #4612 Sunday week + UTC on `main`; #4613 palette/sidebar/settings/onboarding batch; #4619 week grid gutter + pinned Sunday window |
| 2026-10-21 | Week grid: hold-Mod day header keycaps (⇧SU, ⇧M, ...) now render; the header control existed but the grid never used it (compare run 39597000570) |
| 2026-10-21 | Hold-Mod sidebar chips: month picker and Up next chips render, calendar list chip moved onto the list (compare run 39634795849) |
| 2026-10-21 | Per-account page-jump targets (web `calendar-account:` ids) |
| 2026-10-21 | Event jump chips use web day-prefix labels (W1, SU2) and digits after a day pick |
| 2026-10-22 | Week/day hour gutter labels use web's 1 AM track origin (#4686); they sat two hours below their events (a 5 PM event drew on the 3 PM row) |
| 2026-10-22 | Parity capture draws popover windows (form date picker, time list) over the window render, so those surfaces stop showing a closed field |
| 2026-10-22 | macOS capture: register `onboarding-welcome-account-choice` so the welcome account step exports instead of timing out |
| 2026-10-22 | Color swatches and pick keys follow web slot order (lavender, mint, plum, ...) instead of the alphabetical generated enum; time list popover fills its inset with the panel color |
| 2026-10-22 | §7 refreshed from compare run 39732173380; MM.DD.YY date row ✅ |
| 2026-10-22 | Event form date field: web keys on the closed field (↓ / Enter / Space open the calendar, arrows nudge the day) |
| 2026-10-22 | Event form date calendar: arrow keys move a day cursor, Enter or Space picks, Esc closes |
| 2026-10-22 | Event form date field: in-field ↓ hint and calendar header key hints (web `EventFormInfieldHint`, `EventFormCalendarPopoverHints`) |
| 2026-10-22 | Form key hints (date calendar header, color swatches) show the word Enter like web `ShortcutLabel`, not ↩ |

---

## 7. Visual parity evidence (1280×820, Light Beach, demo seed)

Automated captures: workflow `desktop-web-parity-screenshots.yml` (PR #4596). Compare artifact `desktop-parity-compare` pairs `web/` and `macos/` PNGs per surface.

| Surface | Web CI | macOS CI | Match | Diff notes (compare run 39732173380, #4725 branch after the 2026-10-22 merges) |
| --- | --- | --- | --- | --- |
| Week grid | ✅ | ✅ | 🟡 | Both week view; hour labels sit on their events (#4719). macOS shot has no demo events banner, scrolls about an hour later, and the sidebar tip rotates to a different line |
| Mini-calendar | ✅ | ✅ | ✅ | Selected-day ring and selected-week wash match; web also shows a transient ↑ ↓ move-by-week hint |
| Event form | ✅ | ✅ | 🟡 | MM.DD.YY date, ⌘ Enter save bar and web color order match; local 2026-10-22 native flow and export checks confirm both popovers open below their fields; guest row only on macOS (demo fixture) |
| Command palette | ✅ | ✅ | 🟡 | Local 2026-10-22 capture confirms background tint and 8pt blur match the web treatment; palette row/layout differences still need review. Outside-click dismissal is covered in both themes |
| Settings | ✅ | ✅ | 🟡 | Local 2026-10-22 native captures verify the background tint and blur in both themes; view-level export does not reproduce the blur faithfully. Timezone fixture and Accounts focus-ring differences remain |
| Onboarding welcome | ✅ | ✅ | 🟡 | Centered panel and copy match (#4718); #4767 aligns backdrop tint and blur with web; local light/dark native screenshots inspected on 2026-10-23. Full pixel equality remains unverified |

**Keyboard / tips (non-screenshot):** Shift+weekday column jump wired; weekend Shift+S→U/A on macOS; digit jump after day pick wired (W1, SU2 chips); bare day letters in jump mode wired; HHMM create on the picked column wired (web `useShiftHoldEventHints` column time burst).

Re-run `desktop-web-parity-screenshots.yml` on `main` after each merged batch (#4612, #4613, …). Latest dispatch: workflow run 39348622389 (pre-#4612 merge baseline).

### 2026-10-22 source reconciliation

Rechecked against `main` at `7a44b191a` after the overnight merge batch. Corrected stale entries for theme accessor coverage, palette shadow, Quick Add placeholder, weekday targeting, notice focus, save keycaps and screenshot automation. These are source-backed findings, not a new signed-in acceptance run. Remaining partial visual and live-flow entries still require direct verification. Existing Life intro (#4709) and title-bar capture (#4667) PRs must be reconciled before duplicating their changes.

### 2026-10-22 native verification follow-up

Life intro PR #4709 passes strict verification, including native package and UI tests. Enter dismissal and returning to Life without a repeat intro pass in the native regression; signed-in server persistence has not received a new live acceptance run.

Compared the command palette against the web image in run 39786084114. The native palette used the dark overlay token instead of web's background at 85% opacity. The palette now uses the matching background tint, with a 8pt blur applied to the content behind it. Local screenshot inspection confirms the calendar remains faintly visible behind the panel. Both-theme outside-click checks protect hit testing; this does not establish pixel equality for the full palette.

The same completed comparison shows the sidebar toggle on the native title bar. Reconcile draft #4667 against current rendering before adopting its older experiments. Date/time popover placement is verified above; the remaining signed-in acceptance flows are still open audit items.

### 2026-10-22 CI reliability follow-up

The Life intro capture exposed a parity-mode layout update that reapplied the Week fixture after switching views. Layout measurement now preserves the selected view; a model regression fails on the previous reset. Registered `life-view-intro` as an allowed export surface, with a native assertion that export preserves the intro modal. Settings data actions now form an explicit accessibility group, preserving the export button identity. Life intro store tests use isolated defaults and wait for dismissal completion rather than a fixed sleep.

The compact-window CI follow-up reproduces Settings export hit testing at 720×630. Explicit modal accessibility grouping keeps Settings separate from the obscured calendar; the export button remains hittable and the native save panel can be typed into and cancelled at that size.

### 2026-10-22 welcome backdrop follow-up

The welcome modal now uses the existing background tint and applies the shared 8pt blur only to the content behind it, matching the web OverlayPanel treatment. Primary-button text and shadow use semantic theme colors. A native regression covers forward and backward navigation through the three welcome steps in both themes without starting authentication.

Local WelcomeKeyboardTests passed on an interactive desktop on 2026-10-23, exercising clicks, Enter and Escape across all three steps in both themes. Both native window screenshots were inspected: the panel stays sharp, underlying content is blurred, and button text is readable. CI run 39897743843 also passed. Swift contract and desktop export checks pass. This verifies the corrected treatment and navigation, not complete pixel equality. See #4766 and #4767.

### 2026-10-24 native client polish follow-up

Issues #4800 and #4801 address bundled fonts, compact title-bar controls, clickable month days, shortcut hover help, reduced-motion-aware sidebar/form transitions and consistent command-palette/shortcuts-helper surfaces and width. Native interaction regressions pass for actual traffic-light alignment, month clicks, date-to-time Tab navigation, time-arrow menu ownership, plain Return versus Command+Return, held Command hints and matching panel widths. The helper has a named accessibility group separate from its visibility-only test probe.

Command-hold detection needed a running clock for the manual timer engines and had to stop treating modifier transitions as character autorepeats. The monitor also reconciles current modifier state when a key window misses a flags event. A native test holds Command without forcing hint visibility and verifies that the hints disappear on release.

Untouched legacy June samples move to the current week once. Edited or deleted recurring families, edited samples and real events are preserved. Initial narrow/partial-week windows and Today include the current day; explicit date selection survives resizing. Package regressions cover these cases, and a fresh 720pt local launch showed October 23, Friday, with visible samples instead of an empty Sunday. Overlapping event labels, the blank short-chip observation and broader visual/signed-in acceptance remain open for further investigation.

### 2026-10-24 event form footer follow-up

Fresh main comparison run 40048315826 confirms that the title-bar sidebar toggle renders; draft #4667's older rendering experiments are not needed for that capture. The event form footer still squeezed instruction text into two- and three-line word fragments. Its instruction groups now retain their natural width and move onto separate centered rows when the sidebar is narrow. Both-theme native regressions assert single-line instruction bounds and preserve screenshot evidence. The unchanged baseline failed at 42pt for “between fields” and 28pt for “for actions”; corrected local captures show readable groups. Other visual and signed-in acceptance gaps remain open.

### 2026-10-25 event label visibility follow-up

Fresh main capture run 40264860791 shows blank titles on top-clipped Lunch with Sam and Exercise cards and overlapping Wednesday labels. Card text now clips independently of the external focus outline, and timed cards update title placement against the visible viewport when scrolling. A regression fails on the previous unclipped hierarchy; focused tests cover clipping, preserved focus outlines, visible title bounds and scroll-back restoration. Runtime and screenshot verification is tracked in #4840. These focused checks do not establish complete visual parity or signed-in acceptance.

### 2026-10-26 overlapping deck contrast follow-up

The web gives overlapping timed cards a background-colored separation ring and a shadow; native snapshots previously discarded deck membership and only draft cards had a shadow. Native cards now retain that membership and paint a 0.75pt background edge plus focus-sensitive shadow without changing shared deck geometry. Both-theme tests cover edges, focus elevation and pooled-view cleanup, with backward-compatible snapshot decoding. Actual isolated strict and screenshot evidence is tracked in #4842; the full visual and signed-in acceptance audit remains open.

### 2026-10-26 command palette placement follow-up

The composited reference in run 40328832414 confirms that the palette sits below the web's 15vh inset: flexible top and bottom spacers shared unused height. The top inset is now fixed while the bottom retains flexible space. The existing short/full-results regression also checks top position through filtering and clearing in both themes and records window screenshots. Runtime evidence is tracked in #4847; this does not close the broader palette typography or signed-in acceptance review.
