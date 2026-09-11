# Hidden Events

A per-user view preference: hide any event on the calendar (including events
on read-only calendars) without changing the event itself. Hidden events stay
on the grid as a narrow color strip so the time is still occupied. Showing the
event restores the full card.

This is not a field on `EventSchema`. Compass stores one `hiddenEvent` row per
`(userId, eventId)` and the web keeps a TanStack Query of those ids.

## What hiding is

Hiding is a personal overlay. Other people still see the event. Compass does
not delete it, does not write to the calendar provider, and does not emit a
new PostHog event for the toggle.

The key is the event id, including composed occurrence ids (`eventId::recurrenceId`).
Hiding one occurrence of a series does not hide the rest.

## Two ways to hide or show

1. Event menu: focus the card, press `m` (or right-click), choose
   **Hide event** or **Show event**. The item sits after Duplicate, outside the
   read-only filter, so it is available on writable, read-only, and busy
   events. The `x` keycap is `aria-hidden`; the menuitem name is the label.
2. Bare `x` on a focused event card or strip. Same stand-down rules as `m`
   (app lock, typing, event-jump). The legend row is `edit-hide`: "Hide or
   show focused event". It does not require write access.

A failed remote write rolls back the optimistic change and toasts
`Couldn't update event visibility. The change was undone.`

## The strip

Hidden timed and all-day cards render at `HIDDEN_EVENT_STRIP_WIDTH` (8px),
`rounded-full`, calendar color at `opacity: 0.6`, with no title, icons, or
accent bar. They stay `role="button"` and focusable. The accessible name is
prefixed with `Hidden `. They are excluded from overlap fanning and are not
drag or resize targets. All-day events keep their row; hiding does not reclaim
vertical space.

## Storage

- Signed in (remote repository): Mongo `hiddenEvent` collection, unique
  compound index on `(userId, eventId)`. Account deletion deletes the user's
  rows.
- API: `GET /api/user/hidden-events` returns `{ hiddenEventIds }`.
  `PUT /api/user/hidden-events` body `{ eventId, hidden }` returns the full
  list. No id in the path (occurrence ids contain `::`). Session-keyed
  limiter 60/min.
- Anonymous / local repository: `localStorage` key
  `compass.events.hidden-ids`.
- Web query: `["hidden-events", source]`, 60s `staleTime`, optimistic toggle.
  No SSE for this list.

## Out of scope

- Series-wide hide (one id per occurrence only)
- Reclaiming the all-day row when every event in it is hidden
- SSE / live updates of another device's hidden set
- Converging this overlay with calendar-level hiding
  (`compass.calendars.hidden-ids`)

## File map

See [Hidden events](../development/feature-file-map.md#hidden-events) in the
feature file map. Acceptance: [Events](../acceptance/events.md) (Hide and
show an event) and [Shortcuts](../acceptance/shortcuts.md).
