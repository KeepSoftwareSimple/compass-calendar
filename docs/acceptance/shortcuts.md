# Shortcuts

This runbook covers keyboard shortcut parity in Compass. The principle: anything a user can do with a mouse should also be doable with the keyboard.

## Source of Truth

Two files matter, at different depths:

- `packages/web/src/shortcuts/shortcuts.registry.ts` is the display registry: every shortcut's legend entry (label, keys, section, context). When adding a shortcut, update the registry and it appears in the legend overlay (opened with `?`), which is searchable and context-aware. The full, always-current shortcut list is that overlay — this doc deliberately does not duplicate it.
- `packages/web/src/shortcuts/keymap.ts` is the runtime binding source for the shortcuts the onboarding flow teaches; the real handlers, the showcase hint keycaps, and the registry's legend rows all derive from it, so remapping a taught shortcut is a one-file edit. Shortcuts outside the keymap bind at their handler sites (the Day/Week view keys live in `useCalendarViewShortcuts.ts`).

## Scope

Use this guide to validate:

- navigating between views with the keyboard (D, W)
- navigating between days in Day view (J, K, T)
- navigating between weeks in Week view (J, K, T)
- scrolling the timed grid with PageUp / PageDown, including while an event is focused
- opening and using the command palette (Cmd+K), including undo/redo rows
- creating events with keyboard shortcuts (C, A in both Day and Week view)
- editing events with the same keys in Day and Week (Delete, Shift+arrows, draft arrows)
- focusing events with arrow keys (chronological in Day, spatial in Week)
- toggling event-jump chips (`S`) and Hardcore Mode (`H`)
- toggling the sidebar (])
- undoing / redoing with the keyboard (Cmd+Z / Cmd+Shift+Z)
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
- Items include: Create event, Create all-day event, Go to Today, Toggle Hardcore Mode, Practice shortcuts, Show welcome guide, Undo last change, Redo last change, Log Out.
- Undo / Redo rows show their keycaps and stay disabled when there is no history.
- Google Calendar connection status and actions appear in the sidebar, not the command palette.
- Typing filters the list.
- Selecting "Create event" opens the event creation form.
- Pressing Escape closes the palette without taking action.
- Cmd+K works even when a text input elsewhere has focus.

---

## Scenario 5: Create An Event With A Keyboard Shortcut (C In Week View)

### UX

Pressing `C` in Week view opens a new event creation form, equivalent to clicking an empty grid slot.

### Steps

1. Navigate to `/week`.
2. Ensure no input is focused.
3. Press `C`.

### Expected Results

- The event creation form opens.
- The form is equivalent to what would appear after clicking an empty grid slot.

---

## Scenario 6: Create An All-Day Event With A Keyboard Shortcut (A In Week View)

### UX

Pressing `A` in Week view opens a new event form pre-configured as an all-day event.

### Steps

1. Navigate to `/week`.
2. Ensure no input is focused.
3. Press `A`.

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
2. Focus an event in the grid (click it or press `U` then ArrowUp/ArrowDown).
3. Press Delete.
4. Navigate to `/day` and repeat with a focused event.

### Expected Results

- The event is removed from the grid in both views.
- An undo toast appears.
- Pressing Delete with no focused event does nothing (even if the mouse is hovering an event).

---

## Scenario 10: Edit A Focused Event Field With A Sequence (E then T)

### UX

With a grid event focused and no form field being typed in, pressing `E` then `T` within a short window opens that event's form (if needed) and places the caret in the title. The same `E`-prefix pattern targets description (`D`), start (`S`), end (`E`), recurrence (`R`), account (`A`), and color (`C`).

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

## Scenario 12: Tap S To Jump Focus To An Event By Day Prefix

### UX

Pressing `S` shows event-jump chips. Week view chips use day prefixes (`SU`/`M`/`T`/`W`/`R`/`F`/`SA`) plus a per-day index (`W4`, `SU1`). Day view uses numeric chips (`1`, `2`, …). Pressing a day letter highlights that column and focuses its first event; a following digit focuses that index. `Esc` exits (in day view a second `S` also toggles off). Bare Shift and Shift+Tab do not show jump chips. Press `H` to toggle Hardcore Mode independently.

### Steps

1. Navigate to `/week` with timed events on at least two different days.
2. Press `S` once; chips should appear.
3. Press the day letter on a chip (for example `W` for Wednesday), then optionally a digit (`2`) or use arrow keys.
4. Press `Esc` to exit.
5. Press Shift alone or Shift+Tab and confirm jump mode does not activate.
6. Press `H` and confirm Hardcore Mode enters.

### Expected Results

- Chips appear on events when `S` is pressed and stay until Esc.
- A day letter highlights that column and focuses the first event; digits refine to `Wn`.
- Arrow keys keep jump mode on so letter-then-arrows works.
- Shift alone / Shift+Tab / Shift+J do not toggle jump mode.
- While a modal holds the app lock, or focus is in an editable field, `S` does not toggle jump mode.
- `H` toggles Hardcore Mode; Esc exits it.

---

## Scenario 13: H Enters Hardcore Mode

### UX

Bare `H` toggles Hardcore Mode (keyboard-only). While active, pointer clicks are blocked (scroll and hover still work) so the user practices keyboard navigation. A persistent “Hardcore Mode · Esc” indicator shows how to exit. Mode is not persisted across refresh. Shift alone does not enter this mode.

### Steps

1. Navigate to `/week` with at least one event visible.
2. Press `H` (not a chord).
3. Try clicking an event with the mouse.
4. Use `U` / arrows / `Enter` to open an event with the keyboard.
5. Press `Esc` (with no modal/form open) or press `H` again.

### Expected Results

- A “Hardcore Mode · Esc” indicator appears.
- Clicks do not open events or focus controls; the indicator may pulse on a blocked click.
- Clicks inside onboarding UI (`[data-onboarding-ui]`) still work.
- Keyboard shortcuts continue to work.
- If a modal, floating layer, or event form is open, `Esc` dismisses that owner first; a later `Esc` exits Hardcore Mode.
- Exiting clears the indicator. Reloading the page also clears the mode.
- Event-jump chips (`S`) clear when Hardcore enters. Shift alone / Shift-Shift do not toggle Hardcore Mode.

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

## Scenario 15: Scroll The Timed Grid With PageUp / PageDown

### UX

PageUp and PageDown always scroll the timed grid by one viewport, even when focus is on an event card, the sidebar, or another control. Arrow keys still move event focus; J/K still change the visible day or week. The shortcuts do not fire while typing in an input.

### Steps

1. Navigate to `/week` (or `/day`).
2. Click an event so it is focused.
3. Press PageDown, then PageUp.
4. Open an event form, focus the title, and press PageDown.

### Expected Results

- PageDown moves the timed grid later in the day; PageUp moves it earlier.
- The focused event does not change solely because of PageUp / PageDown.
- PageDown does nothing while the title input is focused.

---

## Scenario 16: Time Travel With Z

### UX

Bare `Z` opens the time-travel timezone picker in Day and Week view. Cmd+Z / Ctrl+Z remains undo. Escape closes the picker without dropping an existing secondary hour column.

### Steps

1. Navigate to `/week`.
2. Press `Z`.
3. Choose a timezone, then press Escape from the grid.
4. Press Cmd+Z / Ctrl+Z after an undoable action.

### Expected Results

- `Z` opens the Time travel picker.
- A second hour column appears after a zone is chosen and survives reload until removed.
- Escape closes the picker and leaves the extra column in place.
- Cmd+Z undoes; it does not open time travel.

---

## Focused Regression Checks

If time is limited, run these checks before shipping shortcut-related changes:

1. `D`, `W` navigate to the correct views from any starting view.
2. `J` and `K` navigate days in Day view and weeks in Week view.
3. `T` returns to today from any offset in both Day and Week view.
4. Cmd+K opens the command palette; Escape closes it without action; Undo/Redo rows are present.
5. `C` opens a timed event form and `A` an all-day event form, in both Day and Week view.
6. `]` toggles the sidebar in both Week and Day view.
7. Delete removes a focused event in Day and Week view and shows an undo toast.
8. Cmd+Z / Ctrl+Z undoes the last event action; Cmd+Shift+Z / Ctrl+Shift+Z redoes it.
9. No shortcuts fire inside a focused text input except Cmd+K.
10. Shift+ArrowLeft/Right move a focused event by one day in both Day and Week view.
11. Arrow keys reposition an open draft in both Day and Week view.
12. With a focused event and no draft open: in Week view ArrowUp/ArrowDown stay on the same day and ArrowLeft/Right jump to the time-nearest event on the previous/next non-empty day; in Day view all four arrows move chronological focus.
13. Cmd+D / Ctrl+D duplicates a focused event in Day and Week view.
14. With a focused event, `E` then `T` opens the form with the title focused; `E` then `A` / `C` jump to account / color; bare `E` alone does nothing.
15. Pressing `S` shows event jump chips; a day letter + digit focuses that event; Shift+Tab does not show chips.
16. `H` enters Hardcore Mode (clicks blocked, indicator visible); Esc or another `H` exits. Shift-Shift does not.
17. PageUp / PageDown scroll the timed grid in Day and Week view even when an event is focused; they do not fire in a text input.
18. `Z` opens time travel in Day and Week view; Cmd+Z / Ctrl+Z still undoes and does not open the picker.
