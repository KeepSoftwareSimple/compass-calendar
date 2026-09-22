# Shortcuts

This runbook covers keyboard shortcut parity in Compass. The principle: anything a user can do with a mouse should also be doable with the keyboard.

Welcome, Block Party opt-in, billing-gate behavior, sidebar tip mute, and
one-surface-at-a-time rules are in [Onboarding](./onboarding.md).

The product rules behind those bindings — hold-Mod discovery, targeting
any on-screen field, hints that never lie — are
[Shortcut Commandments](../frontend/shortcut-commandments.md).

## Source of Truth

Two files matter, at different depths:

- `packages/web/src/shortcuts/shortcuts.registry.ts` is the display registry: every shortcut's legend entry (label, keys, section, context). When adding a shortcut, update the registry and it appears in the legend overlay (opened with `?`), which is searchable and context-aware. The full, always-current shortcut list is that overlay — this doc deliberately does not duplicate it.
- `packages/web/src/shortcuts/keymap.ts` is the runtime binding source for the shortcuts the onboarding flow teaches; the real handlers, the showcase hint keycaps, and the registry's legend rows all derive from it, so remapping a taught shortcut is a one-file edit. Shortcuts outside the keymap bind at their handler sites (the Day/Week view keys live in `useCalendarViewShortcuts.ts`).

Adoption is measured with `shortcut_invoked`. Taught outcomes still send `outcome: "succeeded"` and `action_id`. Every legend row also records `shortcut_id` (the registry id) and `section` with `outcome: "handled"` when its handler runs. Query production adoption with:

```sql
SELECT properties.shortcut_id, count(), uniq(person_id)
FROM events
WHERE event = 'shortcut_invoked'
  AND timestamp >= now() - INTERVAL 30 DAY
  AND properties.environment = 'production'
GROUP BY 1
ORDER BY 2 DESC
```


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
- confirming the first-run Meeting wizard Continue / Back keys (Enter, Esc, K, J)
- confirming that shortcuts do not fire while typing in inputs
- hiding and showing an event with `x`, from the event menu, and confirming the strip stays focusable

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
- Items include: Go to Today, Go to Day or Go to Week (the view you are not on), Go to Life, Show shortcuts, Play Block Party (practice shortcuts), Show welcome guide, Create event, Create all-day event, Undo last change, Redo last change, Toggle sidebar, Focus month picker, Open Up Next event, Join Up Next meeting, Time travel, Settings, Log Out (when signed in), Book personal onboarding. Selecting a row that advertises a shortcut pulses the top-center hint "Next time, press …" unless tips are off. The search field placeholder is "Search commands, events, or type a date". Typing two or more characters that match an event title adds an Events section (title plus weekday, date, and time or All day). A query that parses as a date pins a "Go to …" row first; Enter navigates to that date and selects its column. Bare `G` opens the palette for this.
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

With a grid event focused and no form field being typed in, pressing `E` then `T` within a short window opens that event's form (if needed) and places the caret in the title. The same `E`-prefix pattern targets description (`D`), start (`S`), end (`E`), recurrence (`R`), guests (`A`), color (`C`), and RSVP / Going (`G`). Account (calendar picker) is Mod+5 only. RSVP is Mod+- while the form is open.

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

After deleting or moving an event, pressing Cmd+Z (Mac) or Ctrl+Z (Windows/Linux) undoes it. After a series-wide edit or delete (scope All Events or This and Following), Cmd+Z toasts `Can't undo the last change` and leaves the previous undoable action intact; a second press then undoes that earlier action. Empty history toasts `Nothing to undo`.

### Steps

1. Delete an event (see Scenario 9).
2. Immediately press Cmd+Z (Mac) or Ctrl+Z (Windows/Linux).
3. Edit a recurring event and apply it to All Events, then press Cmd+Z, then press Cmd+Z again.

### Expected Results

- The deleted event is restored with its original properties.
- Pressing Cmd+Shift+Z (or Ctrl+Shift+Z) immediately after redoes the undone action.
- After the series-wide edit, the first Cmd+Z toasts `Can't undo the last change` and does not reverse an older, unrelated change. The second Cmd+Z undoes the earlier delete or edit.

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
- Clicks do not navigate, and a click shows the keyboard hint. Hovering the picker shows `I focuses the picker`. Focusing it replaces that with up/down arrow keycaps and `move by week`. After an arrow, `Enter opens it` appears with `Enter` as a keycap. The keyboard hint says to press `I`, then use the arrow keys and Enter.

---

## Scenario 13: The Mouse Teaches the Keyboard

### UX

Compass is the keyboard calendar. Clicks are not blocked (text selection, copy buttons, and native buttons work), but the calendar itself does not respond to the mouse: event cards and empty grid slots have no click handlers. Every click teaches instead of failing silently. A click on a dead target shows a transient top-center hint with the exact keyboard path and arms it: clicking an event turns on jump mode, focuses that event, and names its token, so the token plus Enter opens it without first pressing `H`; clicking an empty grid slot names the HHMM digits that create an event there. A click on a working control that carries a shortcut performs the action and shows "Next time, press ..." so the key is learned without a failed click. The X on the hint turns tips off for that browser; the armed paths keep working with tips off. The hint tone is never a reprimand: it names the key, not the mistake.

`/life` is the exception: it is a public lead magnet, so the hint is off there. Phone sessions are also exempt: MobileGate opts out of the hint so Copy and Waitlist tap normally.

### Steps

1. Navigate to `/week` with at least one event visible.
2. Click an event, note its contextual event token, and press Enter.
3. Click an empty timed-grid slot, note the digits, and type them.
4. Click the sidebar toggle in the header.
5. Click the X on a hint, then click an event again.
6. Tab to any native button and press Enter.

### Expected Results

- Clicking an event does not open it, but jump chips appear, the event is focused, and the hint says `Press <token>, then Enter to open this event.`; Enter alone opens it.
- Clicking an empty timed-grid slot does not open a draft; the hint shows the matching HHMM digits (`1200`, `1830`) and typing those digits creates an event at that time.
- Clicking the all-day row teaches `Shift+C`.
- Clicking the sidebar toggle toggles the sidebar and the hint says `Next time, press ]`.
- Clicking the view switcher opens it and the hint says `Next time, press W, D, or L to switch views.`
- Unannotated controls that look clickable get `Compass works from the keyboard. Press ? to see every shortcut.`; clicking whitespace shows nothing.
- After the X, no hint appears, but clicking an event still focuses it and Enter still opens it.
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

With a grid event focused (form closed, not typing in an input), Cmd+C (Mac) or Ctrl+C (Windows/Linux) copies that event into an in-app clipboard. Cmd+V / Ctrl+V then creates a duplicate on the create target day (the selected column via Shift+day letter, else the focused event's day, else the copied event's own day), keeping the copied event's time of day and duration. An all-day copy keeps its length. After paste the new event is focused and the column selection is spent, like C. Cmd+D still duplicates the currently focused event at its original time. A later copy replaces the previous one. The clipboard lasts for the tab session with no expiry. While a text field is focused, Cmd+C / Cmd+V stay native text copy/paste.

### Steps

1. Navigate to `/week` (or `/day`) with at least two saved events.
2. Focus an event (U, then arrows).
3. Press Cmd+C (Mac) or Ctrl+C (Windows/Linux).
4. Focus a different event and press Cmd+C again.
5. Blur the event (click the grid background is inert; press Escape if needed so nothing is focused) and press Cmd+V.
6. Open an event form, focus the title, select text, and press Cmd+C then Cmd+V.

### Expected Results

- The first Cmd+C does not create an event.
- After the second copy, Cmd+V with nothing selected creates a duplicate of the *second* event at that event's original time. The two source events remain.
- Cmd+V after Shift+day-letter creates the copy on that selected day at the original time of day and spends the column selection.
- Cmd+D still duplicates the currently focused event immediately at its original date.
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

## Scenario 19: First-run Meeting Wizard Continue and Back

### UX

The first-run Meeting wizard Continue and Back keys are Enter, Esc, K,
and J. Hints label them (`Enter Continue`, `Esc Back`, `K Next`,
`J Back`). Those keys do not fire while typing in an input, except
Enter from the address field.

### Steps

1. Open Settings and go to Meeting with no saved page.
2. Confirm the address step shows **Continue** and hides **Back**.
3. Press Enter.
4. Confirm weekly hours shows **Back**.
5. Press J, then K.

### Expected Results

- Step 1 has Continue and no Back. The hint row includes Enter Continue.
- After Enter, Step 2 shows Back. The hint row includes Esc Back, K Next,
  and J Back.
- J returns to the address step. K returns to weekly hours.
- With focus in the address field, K does not continue. Enter does.

---

## Scenario 20: Find An Event By Title (Mod+K)

### UX

The command palette searches saved event titles once the query is two or more characters. Choosing an Events row navigates to that event's day and focuses the card so Enter opens it.

### Steps

1. Navigate to `/week` with at least one saved timed event whose title is distinctive.
2. Press Cmd+K (or Ctrl+K).
3. Type enough of the title to unique-match it.
4. Confirm the Events section lists that title with its weekday, date, and time.
5. Press Enter.

### Expected Results

- An Events heading appears above matching rows (title plus weekday, date, and time or All day).
- The live region announces the result count (or "No results for …" when nothing matches).
- Enter closes the palette, opens the week or day that contains the event, and focuses that event card.
- Tab from the search field does not land in the Events rows. Arrow keys still move the active row.

---

## Scenario 21: Go To A Typed Date (G)

### UX

Bare `G` opens the command palette so the user can type a date. A query that parses as a date pins a "Go to …" row first. Enter navigates to that date, selects its column, and announces the jump.

### Steps

1. Navigate to `/week`.
2. Press `G`.
3. Type a date such as `oct 3` or `2026-12-15`.
4. Press Enter.

### Expected Results

- `G` opens the palette with the search field focused.
- The first row reads "Go to …" with the resolved weekday, month, day, and year.
- Enter navigates so that date is visible and its column is selected.
- A polite status announcement reads "Showing week of …" (Day view: "Showing …").
- `e` then `G` still jumps to RSVP when an event form is open. Typing in an input does not open the palette.

---

## Scenario 22: Coarse-Nudge A Focused Event (Alt+Shift+Arrow)

### UX

Alt means a bigger step, the same idea as Alt+Arrow scrolling the grid by an hour. With a focused event (form closed), Alt+Shift+ArrowUp / ArrowDown move it by one hour. Alt+Shift+ArrowLeft / ArrowRight move it by one week. A week step that leaves the visible window slides the view so the event stays on screen and focused.

### Steps

1. Navigate to `/week` with a timed event on the current week.
2. Focus the event.
3. Press Alt+Shift+ArrowDown, then Alt+Shift+ArrowUp.
4. Press Alt+Shift+ArrowRight.

### Expected Results

- Alt+Shift+ArrowDown moves the event one hour later; Alt+Shift+ArrowUp moves it one hour earlier.
- Alt+Shift+ArrowRight moves it seven days later. If that day was off-screen, the week window slides and the event stays visible and focused.
- All-day events ignore hour steps. Shift+Arrow without Alt still moves one day or 15 minutes.
- Nudging an instance of a recurring event raises one "Apply to series?" toast after you release Shift, not one per step, and it offers the position the burst ended on.

---

## Scenario 23: Paste Onto The Selected Day

### UX

Cmd+V / Ctrl+V pastes the copied event onto the create target day: the selected column (Shift+day letter), else the focused event's day, else the copied event's own day. The copy keeps its time of day. Pasting spends the column selection, like `C`.

### Steps

1. Navigate to `/week` with a saved timed event.
2. Focus it and press Cmd+C / Ctrl+C.
3. Press Shift plus a different day's letter so that column is selected.
4. Press Cmd+V / Ctrl+V.

### Expected Results

- A duplicate appears on the selected day at the original time of day.
- The new event is focused and the column highlight clears.
- Empty paste is a no-op. Copy and paste do not fire while typing in an input.

---

## Scenario 24: Toggle Calendars With Digits

### UX

Once a calendar-account list has focus, digits `1`–`9`, then `0`, `-`, and `=` toggle the first twelve rows. Chips and `aria-keyshortcuts` appear only while that list is focused.

### Steps

1. Navigate to `/week` or `/day` with the sidebar open and at least two calendars in one account.
2. Tab (or hold Mod and press the account's chip) until a calendar row in that list is focused.
3. Press `2`.
4. Tab out of the list.

### Expected Results

- While the list is focused, rows show digit chips and `aria-keyshortcuts` matching their index.
- Pressing that digit toggles the matching calendar. A status line announces Hidden or Shown.
- After focus leaves the list, chips and `aria-keyshortcuts` hide. Digits no longer toggle.

---

## Scenario 25: The Palette Teaches Its Shortcuts

### UX

A command palette row that has a shortcut names that shortcut after you run it, using the same "Next time, press …" hint as a successful click. Rows without a shortcut stay silent.

### Steps

1. Navigate to `/week`.
2. Press Cmd+K / Ctrl+K.
3. Select "Create event" (shortcut `C`).
4. Open the palette again and select "About Compass" (no shortcut).

### Expected Results

- After Create event, a hint says "Next time, press C" (or the current binding).
- About Compass does not show a shortcut hint.
- The X on the hint still turns tips off for that browser. The command still runs.

---

## Scenario 26: The Legend Shows Which Shortcuts You Have Used

### UX

The `?` legend is a progress surface. Rows you have invoked in this browser show a check mark labeled "used". The header counts how many of the visible rows you have used.

### Steps

1. Navigate to `/week`.
2. Press `?` and note "You've used 0 of … shortcuts here".
3. Press Escape, then `T` (Go to today).
4. Press `?` again and find the Go to today row.

### Expected Results

- The header reads "You've used N of M shortcuts here" for the rows currently listed (search narrows both counts).
- After `T`, that row shows a "used" check mark. Unused rows have no check.
- Searching the overlay updates the count to the filtered set.

---

## Scenario 27: Printable Shortcuts Page

### UX

`/shortcuts` is a public, printable catalog of the same registry the `?` overlay shows. It is not wrapped in the signed-in calendar shell.

### Steps

1. Open `/shortcuts` in a logged-out window.
2. Confirm the page title and headings.
3. Print preview (optional).

### Expected Results

- The document title is "Compass keyboard shortcuts".
- An `h1` matches that title. Each catalog group is an `h2`.
- The in-app overlay's "Printable version" link opens this page.

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
16. Grid clicks no longer open click-to-teach `PointerHint` pills; palette teaching is scenario 25. `/life` allows normal clicks. `M` opens the focused event's menu; `F` focuses the newest notice.
17. PageUp / PageDown scroll the timed grid by one viewport in Day and Week view even when an event is focused; they do not fire in a text input.
18. Alt+ArrowUp / Alt+ArrowDown pan the timed grid by one hour in Day and Week view even when an event is focused; they do not fire in a text input.
19. `Z` opens time travel in Day and Week view; Cmd+Z / Ctrl+Z still undoes and does not open the picker.
20. On Day view, hold Mod then a column digit (2+) focuses that writable calendar column; Shift+Arrow / `C` seed a draft there.
21. Cmd+C / Ctrl+C copies a focused event; Cmd+V / Ctrl+V pastes a duplicate on the create target day (selected column, else focused event's day, else the copied event's day) without requiring focus. A later copy replaces the clipboard. Empty paste is a no-op. Copy/paste do not fire while typing in an input (native text clipboard). Cmd+D is unchanged.
22. In Settings > Meeting, hold Mod to reveal chips `1`/`2`/`3` and Enter; extra digits focus nothing; U with Mod held does not copy.
23. On the first-run Meeting wizard, Enter continues, Esc and J go back after step 1, and K continues when focus is not in an editable target.
24. Cmd+K / Ctrl+K finds saved events by title (two or more characters) under an Events heading; Enter focuses that event. The live region announces the result count. Tab does not trap in Events.
25. Bare `G` opens the palette; a parsed date pins "Go to …"; Enter selects that day and announces "Showing week of …" (or "Showing …" on Day view).
26. Alt+Shift+Arrow moves a focused event by an hour (up/down) or a week (left/right) and carries across the visible window.
27. Cmd+V / Ctrl+V after Shift+day-letter pastes onto that selected day and spends the column.
28. A focused calendar list toggles rows with digits; `aria-keyshortcuts` is present only while that list is focused.
29. Running a palette command that has a shortcut shows "Next time, press …".
30. The `?` legend check-marks used shortcuts and counts "You've used N of M shortcuts here".
31. `/shortcuts` is a public printable catalog with an `h1` and per-section `h2` headings.
