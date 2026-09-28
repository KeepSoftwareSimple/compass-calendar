# Booking (v1.11)

Manual and automated checks for milestone **Booking v1.11**: guest wizard
hand-off, reschedule picker behaviour, host notices, guest RSVP notice, grid
RSVP styling, event-form cancel/reschedule actions, and host delete freeing
the reservation.

## Scope

Use this guide to validate booking UX shipped in v1.11. Earlier booking
milestones stay covered in `docs/features/booking.md` and the existing
`e2e/booking/` guest specs.

## Setup

1. **Guest `/meet` flows:** run `bun dev:web` and the booking-web dev server
   (see `docs/development/local-development.md`), or rely on Playwright's
   webServer for `e2e/booking/`.
2. **Host calendar-web flows:** signed-in stub specs use the anonymous dev app
   with stubbed `/api/**` (same pattern as `e2e/attendees/`).
3. **Backend host delete:** needs Mongo (`compass.yaml`); use
   `bun test:backend` for the reservation cancel on delete test.

---

## Scenario 1: Guest wizard hands off to sign-up and resumes go-live

### UX

A signed-out visitor who starts meeting setup from `/?meetingSetup=1` can
finish on a computer: Settings closes before sign-up, the draft stays in local
storage, and after authentication Meeting settings reopen on the go-live step.

### Proof

```bash
bun test:web apps/calendar-web/src/booking/useGuestMeetingSetupEntry.test.tsx apps/calendar-web/src/booking/BookingSettingsSection.guest-handoff.test.tsx
```

Pass when both files are green. On a computer, opening `/?meetingSetup=1`
shows Settings on the meeting wizard with `meetingSetup` cleared from the URL.

---

## Scenario 2: Reschedule page hides the current slot and opens on the meeting day

### UX

On `/meet/reschedule/:id?token=…`, the guest never sees a button for the slot
they already hold. The month grid selects the day of the existing meeting when
the URL has no `date=` param.

### Proof

```bash
bunx playwright test e2e/booking/booking-reschedule-current-slot.spec.ts
bun test:web apps/booking-web/src/booking/PublicBookingReschedulePage.test.tsx
```

Pass when Playwright and unit tests are green. Manually, only alternate slots
appear in the time list and the meeting's day cell has `aria-pressed="true"`.

---

## Scenario 3: Host toasts for book, cancel, and reschedule

### UX

While Compass is open, the host sees one toast when guests book, cancel, or
reschedule (copy uses the host timezone). Several updates collapse to a count
with a Latest line. **Show** jumps the week view to the meeting time.

Cancelled and rescheduled meetings are included. Only reservations that
predate the `lastGuestActionAt` cursor are skipped.

### Proof

```bash
bun test:web apps/calendar-web/src/booking/useNewMeetingsNotice.test.tsx
bun test:backend packages/backend/src/booking/services/booking-page.service.db.test.ts
```

Pass when tests are green. With a backend and two browsers (host + guest),
cancel or reschedule a booking and confirm the host toast mentions
`cancelled` or `moved a meeting to` within a few seconds.

---

## Scenario 4: Host toast when a guest replies (RSVP)

### UX

When a guest accepts, declines, or replies maybe on an event the host
organizes, one toast appears while a Compass tab is open. Replies that arrive
while every tab is closed are not toasted (grid styling still reflects RSVP).

### Proof

```bash
bun test:web apps/calendar-web/src/booking/useGuestRsvpNotice.test.tsx apps/calendar-web/src/booking/GuestRsvpToast.test.tsx
```

Pass when tests are green.

---

## Scenario 5: Grid cards show guest reply state

### UX

Booking-related (and other) events show RSVP at a glance: awaiting reply
(dashed outline, reduced opacity), tentative (dashed outline), all guests
declined (reduced opacity), with accessible name prefixes such as
`Awaiting reply:`.

### Proof

```bash
bun test:web apps/calendar-web/src/grid/grid-event-card-chrome.test.ts apps/calendar-web/src/grid/components/EventCard.test.tsx
```

Pass when tests are green. On the week grid, open a meeting with mixed guest
RSVPs and confirm card labels match the prefix rules.

---

## Scenario 6: Event form Cancel meeting and Reschedule actions

### UX

For a saved event whose description contains matching Compass cancel and
reschedule anchors, the actions row shows **Cancel meeting** and
**Reschedule**. Cancel requires a second press (**Confirm cancel**) and calls
the public cancel API with the parsed token. Reschedule opens the guest
reschedule URL in a new tab.

### Proof

```bash
bunx playwright test e2e/booking/booking-event-form-actions.spec.ts
bun test:web apps/calendar-web/src/views/Forms/EventForm/FormActionsRow.test.tsx apps/calendar-web/src/booking/booking-event-links.test.ts
```

Pass when Playwright and unit tests are green.

---

## Scenario 7: Host delete cancels the reservation

### UX

When the host deletes a booked calendar event in Compass (single event,
scope **this**), the linked reservation becomes `cancelled` and the slot is
freed. Deletes made only in Google Calendar are out of scope.

### Proof

```bash
bun test:backend packages/backend/src/booking/services/public-booking.service.db.test.ts -t "cancels a confirmed reservation when the host deletes"
```

Pass when that test is green.

---

## Accessibility

Changed v1.11 surfaces are covered by:

```bash
bunx playwright test e2e/accessibility/booking-a11y.spec.ts
```

Includes the public reschedule picker and the booked-meeting event form
actions row.
