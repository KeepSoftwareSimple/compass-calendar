# Command palette pages: keyboard-first meeting setup

Plan, drafted 2026-09-30. Nothing here is built yet. Each work package
below is sized to become one agent-task issue.

The goal is one keyboard path for configuring the meeting page that never
asks the user to manage focus: open the palette, confirm a sensible default
with Enter, page with the same keys that page weeks, Escape to back out.
The second half of this doc is an audit of the palette with other
improvements that fall out of the same page mechanism.

Related: [Shortcut Commandments](./shortcut-commandments.md),
[Booking](../features/booking.md), [Shortcuts acceptance](../acceptance/shortcuts.md).

## Today

The palette (`apps/calendar-web/src/components/CommandPalette/CommandPalette.tsx`)
is a flat, sectioned listbox built on `@floating-ui/react`. It has no page
concept. Every row runs an action and closes. Three rows touch the meeting
page, and all of them leave the palette:

| Row | When | Does |
| --- | --- | --- |
| Set up meeting page | no page saved | opens Settings > Meeting (first-run wizard) |
| Meeting settings | signed in | opens Settings > Meeting (full form) |
| Open meeting page | page is live | opens the public URL |

A first-run host gets the five-step wizard in Settings
(`booking/setup/BookingSetupWizard.tsx`): address, hours, duration,
destination, go live. Continue is Mod+Enter, Back is Escape, and each
step focuses its first control.

A configured host gets the full form (`booking/BookingSettingsSection.tsx`):
status switch, meeting link, duration pills, a seven-row weekly hours
editor, then a collapsed **More options** `<details>` with destination,
timezone, blocking calendars, minimum notice and horizon, and a Save bar.
Changing one value means Tab through the form, edit, then Mod+Enter.
The form's fields have no jump chips; hold-Mod shows only sidebar digits.

The wizard already has the right shape (one question per screen, a default
on every step). It is just in the wrong place and on the wrong keys.

## Design

### Pages

The palette gains a page stack. The root page is today's search list. A
page is a title, one sentence, a list of rows with one preselected, and
optional handlers for next and back. Rows look like root rows. Focus stays
on the page's listbox, not in a text input, so bare letters are free
(commandment 5, typing always types).

Keys on a page:

| Key | Does |
| --- | --- |
| ArrowUp / ArrowDown | move between rows |
| Enter | confirm the highlighted row, then go to the next page |
| K | keep the highlighted row, go to the next page (same as Enter) |
| J | previous page |
| Escape | previous page; on the first page, back to the root list |
| Mod+K | close the palette (unchanged) |

J and K match week paging (`app-shortcut-bindings.ts`, `navPrevious` /
`navNext`). The week handlers are app shortcuts and the palette holds the
app lock, so they cannot double-fire. The footer names the page keys the
way it names Navigate, Select and Close today, which is how the palette
teaches them (commandment 10).

Escape peels one layer (commandment 8). A page joins the document Escape
stack through `useOverlayEscape` so the palette's global Escape shortcut,
which already stands down while that stack is armed, does not close the
palette underneath it.

A text page is the exception: it renders one input with the caret in it.
Enter submits, Escape goes back, letters type. Only the address page uses
it, and only after the user asks to change the address.

### The meeting flow

Rows in the root palette:

| Row | When | Opens |
| --- | --- | --- |
| Set up meeting page | no page saved | the flow at Link |
| Meeting link | page saved | the flow at Link, with `…/meet/slug` as detail and an On / Off badge |
| Meeting settings | signed in | Settings > Meeting, unchanged, the escape hatch for the long tail |
| Open meeting page | live | the public URL, unchanged |

The flow reuses the wizard's step order and visibility rules from
`booking/setup/setup-steps.ts`. Destination is hidden when exactly one
writable calendar exists, as today.

**1. Link.** "Your meeting link" and the URL, `suggestedSlug` from the
setup GET for a new host or the saved slug otherwise.

- Use this link (preselected)
- Copy link (saved page only)
- Change address (opens the text page; slug validation and "already taken"
  render under the input exactly as in `BookingSetupAddressStep`)

**2. Hours.** One sentence with the timezone city and abbreviation, the
same line the wizard shows.

- Keep current hours: `summarizeAvailability(saved)` (saved page only, preselected)
- Weekdays, 9:00 AM to 5:00 PM (the default, preselected for a new host)
- Weekdays, 8:00 AM to 4:00 PM
- Weekdays, 10:00 AM to 6:00 PM
- Every day, 9:00 AM to 5:00 PM
- Custom hours (opens Settings > Meeting with the hours editor focused)

Presets cover most hosts with one Enter. The per-day editor with Start and
End menus is the one control in this form that is not a list, and it is
better served in Settings than reproduced in a palette page.

**3. Duration.** 15, 30, 45, 60 minutes. Saved value or 30 preselected.

**4. Destination.** One row per writable calendar, labelled by
`formatBookingDestinationOptionLabel` so the video kind is visible
("Work (Google Meet)"). Saved value or the default target calendar
preselected. Zero writable calendars shows the connect sentence and
the connect rows, and Next is disabled, as the wizard does.

**5. Turn on.** The go-live summary (`BookingSetupGoLiveStep` list) with:

- Turn on and copy link (preselected while off)
- Turn off (preselected while on; the summary then reads "Live")
- Copy link
- Open meeting page (live only)
- More options in Settings (timezone, blocking calendars, notice, horizon)

A new host with good defaults presses Enter five times and is live with the
link on the clipboard. A configured host who wants 45 minutes types "meeting",
Enter, K, K, ArrowDown, Enter, then Escape out.

### Saving

Every page confirm saves. The PUT body is the full form the page came from
(`buildInitialForm` seeds it) with one field changed, and `enabled` stays
what it was until the Turn on page. This is what the wizard's address step
already does, extended to every page.

Why per-page saves over one Save at the end: there is no dirty state, so
Escape is always safe and the discard prompt is not needed; every page is
correct on its own, so a direct row can open one page later without a
special mode; and a failed save shows its error on the page that caused it
and stays there. Five small PUTs per first run is the whole cost.

The blocking calendars default that follows the destination
(`defaultBlockingCalendarIdsForDestination`) applies when the destination
changes, as it does in Settings.

### What does not change

The Settings > Meeting form and its More options stay for the long tail
and for pointer users. The in-Settings wizard stays for the signed-out
guest flow (`/meet` footer, `?meetingSetup=1`), which hands a local draft
to sign-up and cannot run in the palette. Once the flow ships, signed-in
entry points (sidebar card, "Set up meeting page") point at the palette
flow and the in-Settings wizard is guest-only.

## Work packages

Each is one PR, shippable alone, in this order.

**WP-01 Palette pages.** Add the page stack to `CommandPaletteContent`:
a `PalettePage` type (title, sentence, rows, preselected row id, `onNext`,
`onBack`, optional text input), the keydown handling in the table above,
the footer hints, `useOverlayEscape` registration, an aria-live
announcement of "Title. Page N of M." Prove it with a throwaway page in
tests only. No product rows change. Tests: `CommandPalette.test.tsx`
page open, J/K/Escape/Enter, Escape peeling with a page open.

**WP-02 Meeting flow, new host.** `useMeetingPageCmdItems` opens the flow
for an unconfigured host: Link, Hours (presets), Duration, Destination,
Turn on, per-page saves, errors on the page. Pull the step logic the
wizard and the flow share (`setup-steps.ts`, slug validation, go-live
summary, presets) into plain functions in `booking/` so neither copies
the other. Point the sidebar card at the flow. Telemetry: add
`surface: "palette" | "settings"` to the `booking_setup_*` events.
Tests: hook test for the rows, a flow test in `CommandPalette.test.tsx`
with MSW, an e2e in `e2e/booking/` that goes live by keyboard only.

**WP-03 Meeting flow, configured host.** The Meeting link row with detail
and badge, "Keep current hours", the Turn on page's on/off rows, Copy and
Open rows. Acceptance scenario in `docs/acceptance/shortcuts.md` and the
palette row table in Scenario 4. Fix the `booking.md` drift: the address
field renders above More options, not inside it.

**WP-04 More options pages.** Only if WP-03 telemetry shows hosts using
"More options in Settings" from the flow. Timezone (a text page that
filters, reusing the time-travel list), blocking calendars (rows that
toggle with Space, Enter confirms the set), minimum notice and horizon
(preset rows). Not planned until the signal exists.

## Decisions to confirm

- **J and K page, Enter and K both advance.** Enter confirms the row; K
  keeps the highlighted row and moves on. They do the same thing on a
  choice page so that either habit works. Alternative: K only, no Enter
  advance. Not recommended, Enter is what a list teaches.
- **Per-page saves** instead of a Save page. See Saving above.
- **Hours as presets** plus "Custom hours" that leaves for Settings, rather
  than a per-day editor inside the palette.
- **Root stays at two meeting rows** (one config row, one settings row) plus
  Open meeting page. Direct rows like "Meeting duration" can be added later
  as one-line items that open the flow on that page; keywords on the
  Meeting link row ("duration", "hours", "availability", "turn on", "copy")
  cover search until then.

## Palette audit

Ranked by value. Each is small enough to be its own issue; the first three
depend on WP-01.

1. **Timezone and time travel as pages.** Today both rows open a separate
   dialog and reopen the palette on dismiss (`usePaletteAwareOverlayDismiss`).
   As a text page with a filtered list they never leave the palette, and the
   dialog bounce plus its focus-restore special case go away.
2. **Log out as a page.** The confirmation dialog becomes a two-row page
   (Log out, Cancel), removing one overlay and one Escape special case
   (`LogoutConfirmationProvider` closes the palette explicitly today).
3. **One Escape owner.** The palette closes on Escape from two places:
   floating-ui `useDismiss` and the global shortcut in
   `useGlobalShortcuts.ts`, which checks the overlay stack. With pages,
   make the palette a single owner on the overlay Escape stack and drop the
   `useDismiss` Escape path, keeping outside-press dismiss.
4. **Hold Mod shows row digits.** The app's discovery gesture
   (commandment 2) does nothing in the palette. Holding Mod could chip the
   first nine visible rows with 1 to 9 and `Mod+digit` activates one, the
   same map the event form and page areas use. This turns "arrow, arrow,
   arrow, Enter" into one chord for anything on screen.
5. **Disabled rows say why.** Undo, Redo, Open Up Next and Join meeting
   render at half opacity with no reason. A `detail` of "Nothing to undo"
   or "No upcoming event" costs nothing and follows "hints never lie"
   (commandment 3).
6. **Section order by frequency.** The root shows about thirty rows over
   six sections. Navigation is first but Create event, Undo and the meeting
   rows are the frequent ones. Move Common Actions above Navigation and
   collect Show welcome guide, Play Block Party, Share Feedback, Book
   personal onboarding and About into one Help section at the end, so a
   scan without typing lands on actions first. Recent already handles the
   individual case.
7. **Empty state teaches.** "No results for X" could add one line: "Try an
   event title or a date like next friday." The placeholder says it; the
   miss is when the user needs it.
8. **Docs drift.** `docs/CI-CD/versioning.md` says the version is under
   "More > Version" (it is in About). `docs/development/troubleshoot.md`
   names a "Delete account" palette row that is now a keyword on Manage
   Accounts. Both are one-line fixes.
9. **Share the section builder.** `CommandPalette` and `LifeCommandPalette`
   assemble overlapping sections by hand. A single builder with a view
   argument removes the duplicate and makes audit item 6 a one-place
   change. Code quality only, no user-visible change.
