# Shortcuts

This runbook covers keyboard shortcut parity in Compass. The principle: anything a user can do with a mouse should also be doable with the keyboard.

The product rules behind those bindings — hold-Mod discovery, targeting
any on-screen field, hints that never lie — are
[Shortcut Commandments](../frontend/shortcut-commandments.md).

## Source of Truth

Two files matter, at different depths:

- `packages/web/src/shortcuts/shortcuts.registry.ts` is the display registry: every shortcut's legend entry (label, keys, section, context). When adding a shortcut, update the registry and it appears in the legend overlay (opened with `?`), which is searchable and context-aware. The full, always-current shortcut list is that overlay — this doc deliberately does not duplicate it.
- `packages/web/src/shortcuts/keymap.ts` is the runtime binding source for the shortcuts the onboarding flow teaches; the real handlers, the showcase hint keycaps, and the registry's legend rows all derive from it, so remapping a taught shortcut is a one-file edit. Shortcuts outside the keymap bind at their handler sites (the Day/Week view keys live in `useCalendarViewShortcuts.ts`).

## Scope

Use this guide to validate:

- navigating between views with the keyboard (D, W)
- navigating between days in Day view (J, K, T)
- navigating between weeks in Week view (J, K, T)
- scrolling the timed grid with PageUp / PageDown and Alt+ArrowUp / Alt+ArrowDown, including while an event is focused
- opening and using the command palette (Cmd+K), including undo/redo rows
- creating events with keyboard shortcuts (C, A in both Day and Week view)
- editing events with the same keys in Day and Week (Delete, Shift+arrows, draft arrows)
- focusing events with arrow keys (chronological in Day, spatial in Week), including the first arrow when nothing is focused (nearest to now)
- toggling event-jump chips (`H`); the mouse is permanently inert (Compass is keyboard-only)
- toggling the sidebar (])
- undoing / redoing with the keyboard (Cmd+Z / Cmd+Shift+Z)
- confirming Settings > Meeting hold-Mod reveals only sidebar digits and Save Enter
- confirming that shortcuts do not fire while typing in inputs

Do not use this guide to validate:

- full event CRUD flows (see `events.md`)

## Setup

1. Start the app with `bun run dev:web`.
2. Log in with any account.
3. Ensure no input or textarea is focused unless a scenario requires it.

Helpful notes:

- All shortcuts are context-aware. They do not fire when the user is typing in a text input, textarea, or form field — except Cmd+K / Ctrl+K, which opens the command palette from anywhere.
- Shortcuts shown as `Cmd` apply on Mac. On Windows/Linux, use `Ctrl` in place of `Cmd` unless noted otherwise.
- `Mod` means Command on Mac and Control on Windows/Linux.
- `Meta` in key combinations refers to the Command key on Mac and the Windows key on Windows.

---

## Scenario 1: Navigate Between Views With The Keyboard

### UX

Pressing `D` or `W` from anywhere in the app (while not focused in an input) navigates to Day view or Week view respectively.

### Steps

1. Navigate to `/week`.
2. Press `D`.
3. Press `W`.

### Expected Results

- `D` navigates to `/day`.
- `W` navigates to `/week`.
- Each transition happens without a full page reload.

---

## Scenario 2: Navigate Between Days In Day View (J, K, T)

### UX

In Day view, `J` goes back one day, `K` goes forward one day, and `T` returns to today (or scrolls to the current time if already on today).

### Steps

1. Navigate to `/day`.
2. Press `K` three times.
3. Press `J` twice.
4. Note the current date shown, then press `T`.

### Expected Results

- Each `K` advances the view by one day.
- Each `J` moves the view back one day.
- `T` returns the view to today's date regardless of current position.
- If already on today, `T` scrolls the grid to the current time.

---

## Scenario 3: Navigate Between Weeks In Week View (J, K, T)

### UX

In Week view, `J` goes to the previous week, `K` goes to the next week, and `T` returns to the current week.

### Steps

1. Navigate to `/week`.
2. Press `K` twice to advance two weeks.
3. Press `J` once to go back one week.
4. Press `T`.

### Expected Results

- Each `K` advances the view by one week.
- Each `J` moves the view back one week.
- `T` returns the view to the current week.

---

## Scenario 4: Open And Use The Command Palette (Cmd+K)

### UX

Pressing Cmd+K opens the command palette from any view, including while a text input is focused. The palette lists common actions. Pressing Escape closes it.

### Steps

1. Navigate to `/week`.
2. Press Cmd+K (or Ctrl+K on Windows).
3. Observe the palette contents.
4. Use the search/filter to type "event".
5. Select "Create event" from the palette.
6. Press Cmd+K again and then Escape.

### Expected Results

- The command palette opens immediately.
- Items include: Create event, Create all-day event, Go to Today, Practice shortcuts, Show welcome guide, Undo last change, Redo last change, Log Out, Book personal onboarding.
- Undo / Redo rows show their keycaps and stay disabled when there is no history.
- Google Calendar connection status and actions appear in the sidebar, not the command palette.
- Typing filters the list.
- Selecting "Create event" opens the event creation form.
- Pressing Escape closes the palette without taking action.
- Cmd+K works even when a text input elsewhere has focus.

---

## Scenario 5: Create An Event With A Keyboard Shortcut (C In Week View)

### UX

Pressing `C` in Week view opens a new event creation form on the day the user is looking at: a selected day column (Shift + its day letter, see Scenario 12), else the day of the focused event, else today, else the first visible day. The draft starts at the current hour on that day. The timed form has no date field, so this is how a draft lands on the right day. Creating spends the column selection, so the highlight clears.

### Steps

1. Navigate to `/week`.
2. Ensure no input is focused.
3. Press `C`. Discard the draft.
4. Press `K` to go to next week, then hold Shift and press the letter for an empty day (for example `Shift+R` for Thursday), then press `C`.
5. Discard, focus an event on another day with `U` and the arrows, then press `C`.

### Expected Results

- From idle on the current week, the form opens with the draft on today.
- After selecting a column, the form opens with the draft in that column, and the column highlight clears.
- With an event focused, the draft lands on that event's day.
- `Shift+C` and Shift+Arrow place-create follow the same day.

---

## Scenario 6: Create An All-Day Event With A Keyboard Shortcut (Shift+C In Week View)

### UX

Pressing `Shift+C` in Week view opens a new event form pre-configured as an all-day event.

### Steps

1. Navigate to `/week`.
2. Ensure no input is focused.
3. Press `Shift+C`.

### Expected Results

- The event creation form opens with the all-day toggle already enabled.
- No start/end time fields are shown.

---

## Scenario 7: Create An Event With A Keyboard Shortcut (C In Day View)

### UX

Pressing `C` in Day view opens a new timed event form, the same behavior as `C` in Week view.

### Steps

1. Navigate to `/day`.
2. Ensure no input is focused.
3. Press `C`.

### Expected Results

- The event creation form opens.

---

## Scenario 8: Toggle The Sidebar (])

### UX

Pressing `]` toggles the sidebar open or closed from any view.

### Steps

1. Navigate to `/week`.
2. Press `]` to close the sidebar (if open).
3. Press `]` again to reopen it.
4. Navigate to `/day` and repeat.

### Expected Results

- `]` toggles the sidebar in both Week view and Day view.
- The calendar grid expands to fill the space when the sidebar is closed.

---

## Scenario 9: Delete A Focused Event With The Keyboard (Delete)

### UX

Pressing Delete while an event is focused in the Day or Week grid deletes it — equivalent to a mouse-driven delete action. Hover alone is not enough; the event must be focused.

### Steps

1. Navigate to `/week`.
2. Focus an event in the grid (click it, press `U`, or press any Arrow key when nothing is focused).
3. Press Delete.
4. Navigate to `/day` and repeat with a focused event.

### Expected Results

- The event is removed from the grid in both views.
- An undo toast appears.
- Pressing Delete with no focused event does nothing (even if the mouse is hovering an event).

---

## Scenario 10: Edit A Focused Event Field With A Sequence (E then T)

### UX

With a grid event focused and no form field being typed in, pressing `E` then `T` within a short window opens that event's form (if needed) and places the caret in the title. The same `E`-prefix pattern targets description (`D`), start (`S`), end (`E`), recurrence (`R`), guests (`A`), and color (`C`). Account (calendar picker) is Mod+5 only.

### Steps

1. Navigate to `/week`.
2. Create a timed event and save it.
3. Focus the event card (click it once is enough if the form closes first, or press `U` then arrows).
4. Press `E` then `T` quickly.
5. Repeat on `/day` with a focused event.

### Expected Results

- The event form opens with the title input focused and the caret ready to type.
- Bare `E` alone, or `E` followed by an unmapped key, does nothing visible and does not block the next unrelated shortcut.
- While typing in any input, or while a modal holds the app lock, the sequences do nothing.
- With no event focused, the sequences do nothing.

---

## Scenario 11: Undo With The Keyboard (Cmd+Z / Ctrl+Z)

### UX

After deleting or moving an event, pressing Cmd+Z (Mac) or Ctrl+Z (Windows/Linux) undoes it — equivalent to clicking the undo toast.

### Steps

1. Delete an event (see Scenario 9).
2. Immediately press Cmd+Z (Mac) or Ctrl+Z (Windows/Linux).

### Expected Results

- The deleted event is restored with its original properties.
- The undo toast dismisses.
- Pressing Cmd+Shift+Z (or Ctrl+Shift+Z) immediately after redoes the undone action.

---

## Scenario 12: Jump Focus To An Event By Day Prefix

### UX

Pressing `H` shows event-jump chips. Week view chips use day prefixes (`SU`/`M`/`T`/`W`/`R`/`F`/`SA`) plus a per-day index (`W4`, `SU1`). Day view uses numeric chips (`1`, `2`, …). Pressing a day letter highlights that column and focuses its first event, if it has one; an empty column is still selected, so `C`, `Shift+C`, Shift+Arrow, and typed digits (`1400`) create on it. A following digit focuses that index. From idle, a column is entered with Shift and its day letter (`Shift+W`, `Shift+S` then `U`/`A` for the weekend), which always works: bare `T` stays “go to today”, bare `M` stays “open event menu”, and bare `F` stays “focus latest notice”. Day view keeps bare digits, since `Shift+1` is `!`. `Esc` exits (a second `H` also toggles off). Holding Mod reveals the same day prefixes on week column headers, shown as `⇧W` while jump mode is off. Bare Shift and Shift+Tab do not show jump chips.

### Steps

1. Navigate to `/week` with timed events on at least two different days.
2. Press `H` once; chips should appear.
3. Press the day letter on a chip (for example `W` for Wednesday), then optionally a digit (`2`) or use arrow keys.
4. Press `Esc` to exit.
5. Without pressing `H`, press `Shift+W` (or `Shift+S` then `A`) and confirm the matching event is focused; a following digit still refines to `W2`.
6. Press Shift alone or Shift+Tab and confirm jump mode does not activate.

### Expected Results

- Chips appear on events currently visible in the grid when `H` is pressed and stay until Esc. Scrolled-off events keep their jump keys but hide their chips.
- A day letter highlights that column and focuses the first event; digits refine to `Wn`. On a column with no events the highlight still appears, nothing focuses, and `C` or a typed `HHMM` creates there.
- Shift + the day letter enters a column from idle, including while an event is focused; `H` remains available to reveal every chip. Weekend columns use `Shift+S` then `A` / `U`.
- Bare `T` still goes to today while jump is off. With an event focused, bare `M` still opens the event menu. With a visible notice, bare `F` still focuses that notice.
- Arrow keys keep jump mode on so letter-then-arrows works.
- Shift alone / Shift+Tab / Shift+J do not toggle jump mode.
- While a modal holds the app lock, or focus is in an editable field, `H` and leaderless jump tokens do not activate jump mode.

---

## Scenario 12b: Jump Focus To A Day-View Calendar Column

### UX

On Day view, holding Mod reveals numbered chips left to right: `1` on the view dropdown, then each **writable** calendar column (`2`, `3`, …), then the sidebar (month picker, Up next, then each connected calendar account). Pressing that digit focuses the column header or account heading. Shift+Arrow then places a timed draft on that calendar; `C` / `Shift+C` honor the same focused column. Idle create (no column focused) still uses the default target calendar.

### Steps

1. Navigate to `/day` with at least two writable calendars visible as columns.
2. Hold Mod until chips appear. Note the number on a non-default calendar column.
3. Press that digit, then Shift+ArrowDown.
4. Press Enter to open the form and confirm the calendar picker shows that column's calendar.
5. Discard, focus the same column again, and press `C`.

### Expected Results

- Hold-Mod chips on columns follow the view dropdown (`1`, then `2`…). Sidebar chips continue after the last column: month picker, Up next, then one chip per connected account. Collapsed accounts still get a chip; jumping to one expands it. Week view uses the same sidebar map after `1` on the view dropdown (no column chips). With no connected accounts, the last sidebar slot is the calendar list as a whole.
- Read-only columns (for example holidays) have no chip and are not focusable via Mod+digit.
- After focusing a column, Shift+Arrow places a form-closed timed draft in that column.
- `C` and `Shift+C` seed the focused column's calendar. With no column focused, they still use the default create target.

---

## Scenario 12c: Navigate The Month Picker By Week

### UX

The sidebar month picker is a keyboard cursor, not a click target. `I` (or hold Mod and press the picker's digit) lands on the cursor week's first day. In Week view every arrow key moves the cursor one week row; Day view moves one day. Enter opens the cursor week (or day). `Mod+Shift+,` / `Mod+Shift+.` and the header chevrons change the month and keep a focusable day in the new month, so arrows keep working. Clicking a day does nothing; hovering the picker shows `I focuses the picker`, focusing it reveals the arrow keycaps, and using an arrow adds `Enter opens it`. Repeated clicks surface the keyboard hint.

### Steps

1. Navigate to `/week` with the sidebar open and press `I`.
2. Press ArrowDown twice, then ArrowRight once.
3. Press `Mod+Shift+.`.
4. Press Enter.
5. Click any day in the picker three or four times.

### Expected Results

- After `I`, the first day of the highlighted week row has focus and the whole row shows the focus ring.
- Each arrow moves the ring to the next week; the calendar grid does not move yet.
- After `Mod+Shift+.`, the next month is shown and focus is still on a day in that month.
- Enter anchors the week view on the focused row and the muted week capsule matches the visible window. Today is an ink circle, not an accent fill.
- Clicks do not navigate. Hovering the picker shows `I focuses the picker`. Focusing it replaces that with up/down arrow keycaps and `move by week`. After an arrow, `Enter opens it` appears with `Enter` as a keycap. The keyboard hint says to press `I`, then use the arrow keys and Enter.

---

## Scenario 13: The Mouse Is Permanently Inert

### UX

Compass is the keyboard calendar: pointer clicks, right-clicks, and double-clicks do not perform the clicked action (scroll and hover still work). A blocked click on a known action shows a transient, contextual hint with the keyboard path for that action. Clicking an event also activates its jump assignments and selects that event, so the displayed token plus Enter works immediately without first pressing `H`. Keyboard activation is unaffected: Enter/Space on a native button still works, Shift+F10 still opens the focused event's context menu, and `M` opens it directly. Phone sessions are the exception: MobileGate opts out of pointer suppression so Copy and Waitlist can be tapped.

`/life` is the exception: it is a public lead magnet, so pointer clicks work there like a normal page. The calendar views stay keyboard-only.

### Steps

1. Navigate to `/week` with at least one event visible.
2. Click an event, note its contextual event token, type that token, and press Enter.
3. Close the form, then click the sidebar toggle and press the suggested `]` key.
4. Try right-clicking an event.
5. Tab to any native button and press Enter.

### Expected Results

- Clicking an event does not open it, but jump chips appear, the event is selected, and the hint identifies that event's exact token plus `Enter`; the shown sequence opens the event without an initial `H`.
- Clicking either sidebar control does not toggle the sidebar; the hint says to press `]` and uses open/close language matching the current state.
- Clicking an empty timed-grid slot does not open a draft; the hint shows the matching HHMM digits (`1200`, `1830`) and typing those digits creates an event at that time.
- Clicking the all-day row teaches `Shift+C`.
- Unannotated controls retain the generic keyboard-only fallback while contextual coverage is expanded.
- Right-click does not open the context menu; `M` (or Shift+F10) on a focused event does.
- Keyboard shortcuts and Enter/Space activation of buttons continue to work.
- `F` focuses the newest action toast or banner; Tab moves within it, Escape dismisses.

---

## Scenario 14: Shortcuts Do Not Fire While Typing In Inputs

### UX

All view-navigation and action shortcuts are suppressed when the user is focused inside a text input, textarea, or other form control. This prevents accidental navigation or destructive actions while the user is typing.

### Steps

1. Navigate to `/week`.
2. Press `C` to open the event creation form, focusing the title input.
3. With the input focused, press `D`, `W`, `J`, `K`.
4. Press `Delete`.
5. Press Cmd+K.

### Expected Results

- `D`, `W`, `J`, `K`, and `Delete` do not trigger any navigation or action while the form input is focused. The characters type normally into the input.
- Cmd+K (or Ctrl+K) still opens the command palette even from inside the input.
- After pressing Escape to cancel the form, the same shortcuts resume normal behavior.

---

## Scenario 15: Scroll The Timed Grid With PageUp / PageDown And Alt+Arrows

### UX

PageUp and PageDown always scroll the timed grid by one viewport. Alt+ArrowUp and Alt+ArrowDown pan it by one hour. Both work even when focus is on an event card, the sidebar, or another control. Bare arrows still move event focus; J/K still change the visible day or week. The shortcuts do not fire while typing in an input.

### Steps

1. Navigate to `/week` (or `/day`).
2. Click an event so it is focused.
3. Press PageDown, then PageUp.
4. Press Alt+ArrowDown, then Alt+ArrowUp (Option+Arrow on Mac).
5. Open an event form, focus the title, and press PageDown, then Alt+ArrowDown.

### Expected Results

- PageDown moves the timed grid later in the day by one viewport; PageUp moves it earlier by one viewport.
- Alt+ArrowDown moves the timed grid later by one hour; Alt+ArrowUp moves it earlier by one hour.
- The focused event does not change solely because of these scroll shortcuts.
- PageDown and Alt+ArrowDown do nothing while the title input is focused.

---

## Scenario 16: Time Travel With Z

### UX

Bare `Z` opens the time-travel timezone picker in Day and Week view. Cmd+Z / Ctrl+Z remains undo. Escape on the picker closes it without dropping an existing secondary hour column. Escape on the grid while traveling clears the extra column. The second timezone has no click-to-dismiss control; the sidebar hint advertises Esc to exit.

### Steps

1. Navigate to `/week`.
2. Press `Z`.
3. Confirm the picker describes comparing hours in a second timezone, then choose a timezone.
4. Press Escape from the grid.
5. Press `Z` again, choose a timezone, then press Escape while the picker is still open.
6. Press Cmd+Z / Ctrl+Z after an undoable action.

### Expected Results

- `Z` opens the Time travel picker with a one-line description of the feature.
- A second hour column appears after a zone is chosen and survives reload until removed. Both timezone abbreviations show in the gutter; there is no X control.
- The sidebar hint reads that two timezones are showing and Esc exits.
- Escape from the grid while traveling clears the extra column.
- Escape closes the picker and leaves the extra column in place.
- Cmd+Z undoes; it does not open time travel.

---

## Scenario 17: Copy And Paste An Event (Cmd+C / Cmd+V)

### UX

With a grid event focused (form closed, not typing in an input), Cmd+C (Mac) or Ctrl+C (Windows/Linux) copies that event into an in-app clipboard. Cmd+V / Ctrl+V then creates a duplicate at the original date and time, the same result as Cmd+D, including when nothing is focused. A later copy replaces the previous one. The clipboard lasts for the tab session with no expiry. While a text field is focused, Cmd+C / Cmd+V stay native text copy/paste.

### Steps

1. Navigate to `/week` (or `/day`) with at least two saved events.
2. Focus an event (U, then arrows).
3. Press Cmd+C (Mac) or Ctrl+C (Windows/Linux).
4. Focus a different event and press Cmd+C again.
5. Blur the event (click the grid background is inert; press Escape if needed so nothing is focused) and press Cmd+V.
6. Open an event form, focus the title, select text, and press Cmd+C then Cmd+V.

### Expected Results

- The first Cmd+C does not create an event.
- After the second copy, Cmd+V creates a duplicate of the *second* event at that event's original time. The two source events remain.
- Cmd+D still duplicates the currently focused event immediately.
- Cmd+C / Cmd+V inside the title field copy and paste text and do not duplicate an event.

---

## Scenario 18: Settings Meeting Hold-Mod Chips

### UX

Settings > Meeting hold-Mod reveals only sidebar digits `1` / `2` / `3` and Enter on Save. Extra digit chords and the Accounts copy chord do nothing. Save is Mod+Enter. Meeting settings do not use a letter leader.

### Steps

1. Open Settings and go to Meeting with the page already configured and live.
2. Hold Mod until the chips appear.
3. Press `5`.
4. Press `U` while Mod is still held.

### Expected Results

- Chips `1`, `2` (when billing is present), `3`, and the save bar's `Enter` appear while Mod is held. The nav hint **Hold Mod to see shortcuts.** hides while chips are visible. No Meeting field, legend, summary, weekly hours plus or minus, or icon button shows a chip.
- Extra digit chords change focus to nothing and toggle nothing.
- Holding Mod and pressing U does not write to the clipboard.
- Releasing Mod hides the nav chips and restores the nav hint.

---

## Focused Regression Checks

If time is limited, run these checks before shipping shortcut-related changes:

1. `D`, `W` navigate to the correct views from any starting view.
2. `J` and `K` navigate days in Day view and weeks in Week view.
3. `T` returns to today from any offset in both Day and Week view.
4. Cmd+K opens the command palette; Escape closes it without action; Undo/Redo rows are present.
5. `C` opens a timed event form and `Shift+C` an all-day event form, in both Day and Week view. In Week view both land on the selected column, else the focused event's day, else today, else the first visible day.
6. `]` toggles the sidebar in both Week and Day view.
7. Delete removes a focused event in Day and Week view and shows an undo toast.
8. Cmd+Z / Ctrl+Z undoes the last event action; Cmd+Shift+Z / Ctrl+Shift+Z redoes it.
9. No shortcuts fire inside a focused text input except Cmd+K.
10. Shift+ArrowLeft/Right move a focused event by one day in both Day and Week view.
11. Arrow keys reposition an open draft in both Day and Week view.
12. With no event focused and no particular control focused (document body), any Arrow key focuses the timed event nearest now in the current Day/Week view (in-progress, else next upcoming, else most recently ended; today preferred in Week; all-day only if no timed events). Further arrows then follow the existing rules. `U` still focuses the first DOM-order event. With a focused event and no draft open: in Week view ArrowUp/ArrowDown stay on the same day and ArrowLeft/Right jump to the time-nearest event on the previous/next non-empty day; in Day view all four arrows move chronological focus.
13. Cmd+D / Ctrl+D duplicates a focused event in Day and Week view.
14. With a focused event, `E` then `T` opens the form with the title focused; `E` then `A` / `C` jump to guests / color; bare `E` alone does nothing.
15. Pressing `H` shows event jump chips; a day letter + digit focuses that event; `Shift` + the day letter enters a column without a prior `H`, including an empty column, and `C` then creates there; Shift+Tab does not show chips.
16. Mouse clicks, right-clicks, and double-clicks are inert on calendar views; a blocked click shows the keyboard-only hint. `/life` allows normal clicks. `M` opens the focused event's menu; `F` focuses the newest notice.
17. PageUp / PageDown scroll the timed grid by one viewport in Day and Week view even when an event is focused; they do not fire in a text input.
18. Alt+ArrowUp / Alt+ArrowDown pan the timed grid by one hour in Day and Week view even when an event is focused; they do not fire in a text input.
19. `Z` opens time travel in Day and Week view; Cmd+Z / Ctrl+Z still undoes and does not open the picker.
20. On Day view, hold Mod then a column digit (2+) focuses that writable calendar column; Shift+Arrow / `C` seed a draft there.
21. Cmd+C / Ctrl+C copies a focused event; Cmd+V / Ctrl+V pastes a duplicate at the original time without requiring focus. A later copy replaces the clipboard. Empty paste is a no-op. Copy/paste do not fire while typing in an input (native text clipboard). Cmd+D is unchanged.
22. In Settings > Meeting, hold Mod to reveal chips `1`/`2`/`3` and Enter; extra digits focus nothing; U with Mod held does not copy.
