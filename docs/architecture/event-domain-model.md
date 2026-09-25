# Event Domain Model

The event domain is the most cross-cutting part of Compass. Read this before changing event shape, recurrence logic, sync behavior, or local persistence.

## Current Contracts (sub-calendar v1)

The runtime uses the strict calendar-owned contracts everywhere: Mongo
storage, the HTTP API, SSE, IndexedDB, and the web data/state layers. The
pre-cutover legacy event model (and its `event.legacy-bridge.ts` conversion
shim) has been fully removed: the sections below describe the current model
only.

- `packages/core/src/types/domain-primitives.ts`: branded ids, `DateOnly`,
  `DateTime` (RFC 3339 with offset), `TimeZone`, `SortOrder`, `RRule`.
- `packages/core/src/types/event.contracts.ts`: canonical `Event`: required
  `calendarId`, discriminated `content` (`details` | `busy`), `schedule`
  (`timed` | `allDay`, exclusive all-day ends), `recurrence`
  (`single` | `series` | `occurrence`), plus `BusyPeriod` for free/busy-only
  calendars.
- `packages/core/src/types/event-command.contracts.ts`: create (optional
  client id), full-replace, delete, list and availability queries.
- `packages/core/src/types/calendar.contracts.ts`: `Calendar` read model with
  provider/access and derived capabilities (`getCalendarCapabilities`).
- `packages/core/src/types/server-message.contracts.ts`: the discriminated
  SSE union every backend publish site must emit.
- `packages/backend/src/calendar/calendar.record.ts`,
  `packages/backend/src/event/event.record.ts`: the backend's own record
  shapes, now vestigial for events (the backend delegates event storage to
  Sync; its own `event.record.ts` survives only for the calendar-cascade
  delete path).
- `packages/sync/src/storage/contracts/event.contracts.ts`: the actual
  canonical event record Sync persists (`SyncEventSchema` in
  `packages/core/src/types/sync/event.contracts.ts` is its wire-facing
  counterpart). Google↔record mapping lives in `packages/sync/src/providers/google/`.
- `packages/web/src/events/event-draft.types.ts` + `event-draft.parser.ts`:
  the only intentionally incomplete event shape and the single parser that can
  turn it into a command.

## Deferred Beyond V1

These are scoped out of the sub-calendar v1 contracts above, not overlooked.
Each line names the decision in the project's
[master doc](https://github.com/SwitchbackTech/compass-calendar/blob/90696e1dd9b279f7f1c56be0cef93b8b9c5787fe/team/archive/google-subcalendar-project/master-doc.md)'s
assumption log that anchors the carve-out, so a future v2 effort starts from
the recorded reasoning instead of rediscovering it:

- **Cross-calendar event moves.** An existing event's `calendarId` is
  immutable once created (A6): creating and duplicating pick a calendar,
  editing shows it as read-only text, and there is no move control. General
  cross-calendar moves need their own Google and recurrence
  semantics (what happens to a moved recurring series, a moved event's
  provider identity) that v1 never had to answer.
- **Non-Google providers.** `CalendarProviderSchema` is `local | google |
  microsoft | apple`. Sync resolves adapters through `ProviderRegistry`
  (`packages/sync/src/providers/provider-registry.ts`). Google is the
  registered kind. Microsoft and Apple adapter sets live under
  `packages/sync/src/providers/<kind>/` and register in M-09 / A-08. Domain
  and web code must not branch on `provider === "x"`; they use
  `ProviderCapabilitySchema` and calendar capabilities. See
  [Calendar providers](../features/calendar-providers.md).
- **Shared-calendar administration.** Compass reads the provider calendar list
  and lets a user change Compass-local visibility, but never creates, deletes, or
  manages sharing/ACLs on a provider calendar (A1, A15). Calendar lifecycle
  stays server-owned and provider-authoritative in v1.

## Core Event Schema

Primary source:

- `packages/core/src/types/event.contracts.ts`

Important event fields:

- `id`: Compass event id
- `calendarId`: required, immutable once created (see Deferred Beyond V1)
- `content`: discriminated union: `details` (`title` + `description` +
  optional `color` as an `EventColorSlot`) or `busy` (free/busy-only
  calendars). `color` maps 1:1 onto Google's 11 event `colorId` values; when
  absent, the card keeps the theme-flat fill and calendar identity stays the
  accent stripe. `details` also carries the provider-sourced `location`,
  `organizer`, `attendees`, and `conference` (`{ url, label }`, the meeting
  link the provider minted). `conference` is read-only on the event; a
  create requests one through `CreateEventInputSchema.createConference`
  (`event-command.contracts.ts`), and the provider decides the kind.
- `schedule`: discriminated union: `timed` (`start`/`end`/`timeZone`) or
  `allDay` (`DateOnly` `start`/`end`, exclusive end)
- `recurrence`: discriminated union: `single` (standalone event), `series`
  (recurring base, carries `rules`), or `occurrence` (references its parent
  via `seriesId`)
- `providerManaged`: optional, present only when `true` (same convention as
  `icalUid`). Marks events the provider owns and keeps updating (today: Google
  events whose `eventType` is not `"default"`, such as Gmail-created flights).
  Omitted on events imported before the field existed and on locally created
  events.
- `createdAt`, `updatedAt`

Sync persists Compass overlays for provider-managed events in a separate
`customizations` record field (`packages/sync/src/storage/contracts/event.contracts.ts`):
optional `title`, `description`, and `location` served over the provider's
values while schedule follows the provider. The wire contract exposes
`providerManaged` on `SyncEventInstanceSchema`; customizations stay on the sync
record and are applied when instances are assembled
(`packages/sync/src/domain/event-instance-assembly.ts`).

The backend record shape (`packages/backend/src/event/event.record.ts`) mirrors
this with Mongo-native types (`ObjectId`, `Date`) plus a single nullable
`externalReference` for provider identity (Google `eventId` /
`recurringEventId`) instead of separate `gEventId`/`gRecurringEventId` fields.

## Display Categories

`Categories_Event` (`packages/web/src/common/types/web.event.types.ts`) maps
events to visible buckets:

- `allday`
- `timed`

These are UI-facing categories, not storage categories.

Recurrence planning, projection, and Google propagation are owned entirely
by Sync now: see [Common Change Recipes](../development/common-change-recipes.md#change-recurring-event-behavior)
for the current file list.

## Update Scopes

Recurring edits use `RecurringEventUpdateScope` on the web side
(`packages/web/src/common/types/web.event.types.ts`), which maps to the
backend/Sync `RecurrenceScopeSchema` (`"this" | "all" | "thisAndFollowing"`,
`packages/core/src/types/event-command.contracts.ts`):

- `This Event` → `this`
- `This and Following Events` → `thisAndFollowing`
- `All Events` → `all`

## Backend Event Shape Semantics

The backend's event contract mirrors Sync's recurrence model:

- one series master event (`recurrence.kind === "series"` on the app-facing
  `Event` / `"seriesMaster"` on Sync's internal record) containing `rules`
- zero or more occurrences (`recurrence.kind === "occurrence"` /
  `"exception"` internally) referencing the series via `seriesId`

Sync projects occurrences into the rolling sync horizon rather than
persisting every future instance: see
`packages/sync/src/domain/occurrence-projection.ts` and `reproject.ts`.

## Optimistic IDs

The web generates a real Mongo `ObjectId` client-side (`createObjectIdString()`) before the create mutation fires, so the optimistic event and the persisted event share the same `id`:

- web optimistic flow: `packages/web/src/events/mutations/useEventMutations.ts`
- backend normalization: `packages/backend/src/event/controllers/event.controller.ts`

Do not assume every incoming `id` is already a durable Mongo id.

## Invariants To Preserve

- Every persisted event must have a stable Compass `id`.
- Occurrences reference their series via `recurrence.seriesId`.
- Series events carry `recurrence.rules`.
- The schedule of a provider-managed event is never customized; start and end
  always follow the provider.
- A customization set back to the provider's exact value for that field is
  cleared, so later provider updates to that field show through.
- Local storage schemas can evolve, but migrations must preserve existing user data.

## Before Changing The Domain

Check all three layers:

1. `core` type/schema definition
2. `backend` persistence and sync behavior
3. `web` editing, rendering, selectors, storage, and tests
