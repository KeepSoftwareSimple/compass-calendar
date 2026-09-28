# Booking (host and guest)

This runbook covers Booking v1.11 cancel, reschedule, RSVP, and host-notice
behaviour on Compass Cloud. Locked product rules live in
[`docs/features/booking.md`](../features/booking.md) and the tracking issue
#4077.

## Scope

Use this guide to validate:

- anonymous guest wizard hand-off to sign-up and resume on go-live
- guest reschedule picker excluding the current slot and opening on the meeting day
- host toasts for book, cancel, and reschedule (pull claim)
- host toasts when a guest replies to the invite (web-side diff)
- grid card styling and accessible names for guest reply state
- cancel and reschedule from the host event form (keyboard and actions row)
- host delete of a booked event cancelling the reservation

Do not use this guide for full Meeting Settings parity (see
`e2e/booking/host-settings.spec.ts`) or generic event editing (see
[`events.md`](./events.md)).

## Setup

1. **Guest flows:** `bun run dev:booking-web` (or CI Playwright, which starts
   booking-web). Guest URLs use `publicBookingAppUrl()` in `e2e/booking/`.
2. **Host flows:** `bun run dev:web` with `compass.yaml` and a writable Google
   calendar, or the stubbed signed-in harnesses in `e2e/booking/` and
   `e2e/attendees/`.
3. **Automated:** `bun test:web` (unit), `bunx playwright test e2e/booking`,
   `bunx playwright test e2e/accessibility/booking-a11y.spec.ts`.

---

## Scenario 1: Guest wizard hands off to sign-up and resumes

### UX

On the go-live step, **Sign up to go live** closes Settings, keeps the draft in
local storage, and after sign-up reopens Meeting settings on go-live with the
draft restored.

### Proof

- `apps/calendar-web/src/booking/BookingSettingsSection.guest-handoff.test.tsx`
- `apps/calendar-web/src/booking/setup/BookingSetupWizard.test.tsx` (button copy
  **Sign up to go live**)

### Expected

Settings is not stacked under sign-up; the draft slug and hours survive OAuth or
email sign-up and appear on the go-live step.

---

## Scenario 2: Reschedule page excludes the current slot

### UX

The tokenized slots list does not offer the reservation's current start as a
selectable time. **Current time** in the header still shows the booked slot.

### Proof

- `bunx playwright test e2e/booking/public-booking-reschedule-picker.spec.ts`
- `packages/backend/src/booking/services/public-booking.service.db.test.ts`
  (reschedule slots omit current start)

### Expected

No slot button matches the current `slotStart`; an alternate slot on the same
day remains selectable.

---

## Scenario 3: Reschedule picker opens on the meeting day

### UX

`/meet/reschedule/:id?token=` with no `date` search param selects the month day
that holds the meeting.

### Proof

- `e2e/booking/public-booking-reschedule-picker.spec.ts` (meeting day button
  `aria-pressed="true"`)
- `apps/booking-web/src/booking/PublicBookingReschedulePage.test.tsx`

### Expected

The month grid highlights the day of the confirmed `slotStart` on first paint.

---

## Scenario 4: Host toasts for book, cancel, and reschedule

### UX

When Compass is open, `POST /api/booking/page/new-meetings/claim` reports guest
actions after the host notice cursor. One toast each for book, cancel, and
reschedule; plural copy when several updates queued. **Show** jumps the week
view to the meeting time (cancel uses the freed slot).

### Proof

- `apps/calendar-web/src/booking/useHostNewMeetingsNotice.test.tsx` (or adjacent
  host-notice tests)
- `packages/backend/src/booking/services/booking-page.service.db.test.ts`
  (claim kinds `booked`, `cancelled`, `rescheduled`)
- Manual: create/cancel/reschedule a guest booking, refocus the host tab after
  SSE or wait for visibility claim; toast copy matches
  `docs/features/booking.md` **Host notice**

### Expected

Copy uses the host effective timezone (`ddd, MMM D, h:mm A`). Pre-deploy
reservations are never announced (no backfill).

---

## Scenario 5: Host toast when a guest replies

### UX

After events refetch, the host sees `Bob accepted: …`, `Bob declined: …`, or
`Bob replied maybe: …` for organized meetings (self excluded). Plural:
`N guests replied. Latest: …`.

### Proof

- `apps/calendar-web/src/booking/useGuestRsvpNotice.test.tsx`
- `apps/calendar-web/src/booking/GuestRsvpToast.tsx`

### Expected

Replies that arrive while no tab is open are not announced (grid styling still
updates). Show jumps to the event week.

---

## Scenario 6: Grid cards show guest reply state

### UX

Organizer events roll up guest `responseStatus`: awaiting (dashed outline and
opacity 0.7), tentative (dashed outline), all declined (opacity 0.5). Accessible
names prefix **Awaiting reply:**, **Tentative:**, or **Declined:**.

### Proof

- `apps/calendar-web/src/grid/grid-event-card-chrome.test.ts`
- `apps/calendar-web/src/grid/components/EventCard.test.tsx`
- [`docs/features/attendees.md`](../features/attendees.md) **Guest reply on the grid**

### Expected

No new color tokens; styling matches locked decisions on #4077.

---

## Scenario 7: Event form cancel and reschedule actions

### UX

When the description contains both `/meet/cancel/` and `/meet/reschedule/` token
anchors, the actions row shows **Cancel meeting** (two-step confirm) and
**Reschedule** (new tab). `Mod+Shift+X` confirms cancel; `Mod+Shift+E` opens
reschedule.

### Proof

- `bunx playwright test e2e/booking/booked-meeting-event-form.spec.ts`
- `apps/calendar-web/src/views/Forms/EventForm/EventForm.test.tsx`
- `apps/calendar-web/src/views/Forms/EventForm/FormActionsRow.test.tsx`
- `e2e/accessibility/booking-a11y.spec.ts` (booked meeting form axe checkpoint)

### Expected

Cancel POST uses the parsed token; reschedule opens
`/meet/reschedule/:id?token=` in a new tab.

---

## Scenario 8: Host delete cancels the reservation

### UX

Deleting the booked calendar event in Compass (single instance, scope **this**)
cancels the linked reservation and frees the slot. Deletes only in Google
Calendar are out of scope.

### Proof

- `packages/backend/src/booking/services/public-booking.service.db.test.ts`
  (`cancels a confirmed reservation when the host deletes its calendar event`)

### Expected

Reservation status becomes `cancelled`; guest slots no longer treat the interval
as occupied by that booking.
