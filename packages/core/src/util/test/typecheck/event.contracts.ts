import { z } from "zod/v4";
import {
  CalendarIdSchema,
  DateTimeSchema,
  EventIdSchema,
  RRuleSchema,
} from "@core/types/domain-primitives";
import { EventScheduleSchema } from "@core/types/event.contracts";
import {
  AttendeeSchema,
  ConferenceSchema,
  OrganizerSchema,
} from "@core/types/event-attendance.contracts";
import {
  EventColorSlotSchema,
  OptionalHexEventColorSchema,
  OptionalNullableEventColorSchema,
} from "@core/types/event-color.contracts";
import {
  ConnectionIdSchema,
  ProviderCalendarIdSchema,
  ProviderEventIdSchema,
} from "@core/types/sync/identity.contracts";

// Canonical, provider-neutral event contracts for Compass Sync.
// This is the logical record Sync persists per event/series;
// Google/Microsoft SDK shapes stay inside provider adapters and
// never appear here. Schedule reuses the app-facing EventScheduleSchema
// (event.contracts.ts) since timed-vs-all-day/DST semantics are identical.

export const ClientEventIdSchema = z.string().trim().min(1).max(256);
export type ClientEventId = z.infer<typeof ClientEventIdSchema>;

export const ProviderEventVersionSchema = z.string().trim().min(1).max(1024);
export type ProviderEventVersion = z.infer<typeof ProviderEventVersionSchema>;

export const SyncEventOriginSchema = z.enum(["compass", "provider"]);
export type SyncEventOrigin = z.infer<typeof SyncEventOriginSchema>;

export const ProviderDeliveryStateSchema = z.enum([
  "pending",
  "confirmed",
  "failed",
]);
export type ProviderDeliveryState = z.infer<typeof ProviderDeliveryStateSchema>;

// Present only once an event is linked to exactly one owning provider
// calendar. Unlinked events have no provider truth.
export const SyncEventOwnershipSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("unlinked") }),
  z.strictObject({
    kind: z.literal("linked"),
    connectionId: ConnectionIdSchema,
    calendarId: ProviderCalendarIdSchema,
    providerEventId: ProviderEventIdSchema,
    providerVersion: ProviderEventVersionSchema,
    // Provider's own last-update timestamp; null until the provider has
    // reported one (e.g. immediately after an ambiguous create).
    providerUpdatedAt: DateTimeSchema.nullable(),
    deliveryState: ProviderDeliveryStateSchema,
    // Minimal opaque bag for adapter-internal identity/concurrency facts
    // (e.g. a recurring-instance fingerprint), never the full provider
    // payload. Preserves the adapter-internal facts Sync needs without
    // duplicating provider state Sync doesn't otherwise model.
    providerMetadata: z.record(z.string(), z.string()).readonly().optional(),
  }),
]);
export type SyncEventOwnership = z.infer<typeof SyncEventOwnershipSchema>;

export const SyncEventContentSchema = z.strictObject({
  title: z.string(),
  description: z.string(),
  location: z.string().nullable(),
  organizer: OrganizerSchema.nullable(),
  attendees: z.array(AttendeeSchema).readonly(),
  conference: ConferenceSchema.nullable(),
  // Null means "clear the color tag" on an update command. Stored/read
  // records omit the field when there is no color.
  color: OptionalNullableEventColorSchema,
  // A provider-assigned custom color with no Compass slot equivalent (e.g. a
  // Google event label). Read-only: no write command ever sets this.
  colorHex: OptionalHexEventColorSchema,
});
export type SyncEventContent = z.infer<typeof SyncEventContentSchema>;

const SingleRecurrenceSchema = z.strictObject({ kind: z.literal("single") });

const SeriesMasterRecurrenceSchema = z.strictObject({
  kind: z.literal("seriesMaster"),
  rules: RRuleSchema,
});

// One overridden or cancelled instance of a recurring series.
// recurrenceId is the instance's original scheduled start before override —
// the standard identity providers use to address one occurrence.
const RecurrenceExceptionSchema = z.strictObject({
  kind: z.literal("exception"),
  seriesId: EventIdSchema,
  recurrenceId: DateTimeSchema,
  cancelled: z.boolean(),
});

export const SyncEventRecurrenceSchema = z.discriminatedUnion("kind", [
  SingleRecurrenceSchema,
  SeriesMasterRecurrenceSchema,
  RecurrenceExceptionSchema,
]);
export type SyncEventRecurrence = z.infer<typeof SyncEventRecurrenceSchema>;

// Visible while a Compass-initiated deletion has not yet been provider
// confirmed. The record is removed, and a content-free
// deletion marker takes its place, only after confirmation.
export const SyncEventLifecycleStateSchema = z.enum([
  "active",
  "deletionPending",
]);
export type SyncEventLifecycleState = z.infer<
  typeof SyncEventLifecycleStateSchema
>;

export const SyncEventSchema = z.strictObject({
  id: EventIdSchema,
  // Caller-generated id used to make anonymous-to-cloud promotion and retry
  // idempotent; null once no longer needed for that purpose.
  clientEventId: ClientEventIdSchema.nullable(),
  origin: SyncEventOriginSchema,
  ownership: SyncEventOwnershipSchema,
  content: SyncEventContentSchema,
  schedule: EventScheduleSchema,
  recurrence: SyncEventRecurrenceSchema,
  lifecycleState: SyncEventLifecycleStateSchema,
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
  confirmedAt: DateTimeSchema.nullable(),
});
export type SyncEvent = z.infer<typeof SyncEventSchema>;

// Sync is the store of record for both provider-linked and still-unlinked
// Compass cloud events, so an occurrence's calendar grouping key must
// accept either identity space: Compass's own calendar id for an unlinked
// event, or the provider calendar id once one exists.
export const SyncEventCalendarIdSchema = z.union([
  CalendarIdSchema,
  ProviderCalendarIdSchema,
]);
export type SyncEventCalendarId = z.infer<typeof SyncEventCalendarIdSchema>;

// One derived, display-ready instance within the rolling sync horizon (12
// months past / 18 months future). Never expand a non-ending series to
// completion; project only the bounded window a query needs.
export const OccurrenceKeySchema = z.string().trim().min(1).max(512);
export type OccurrenceKey = z.infer<typeof OccurrenceKeySchema>;

// A full-fidelity event row for the browser calendar read. It carries
// everything the app needs to render AND edit an event: full content, the
// projected instance schedule, and how the row relates to a series. The backend
// translates one of these into an app-facing Event.
//
// Row kinds returned for a recurring series over a range, mirroring what the
// legacy store materializes today:
//   - one `series` master row (the app keeps it for edit-all-future, but
//     suppresses it from rendering), plus
//   - one `occurrence` row per projected instance in range.
// A non-recurring event is a single `single` row.
const SyncInstanceContentSchema = z.strictObject({
  title: z.string(),
  description: z.string(),
  location: z.string().nullable(),
  organizer: OrganizerSchema.nullable(),
  attendees: z.array(AttendeeSchema).readonly(),
  conference: ConferenceSchema.nullable(),
  color: EventColorSlotSchema.optional(),
  colorHex: OptionalHexEventColorSchema,
});
export type SyncInstanceContent = z.infer<typeof SyncInstanceContentSchema>;

const SingleInstanceRecurrenceSchema = z.strictObject({
  kind: z.literal("single"),
});

// The series master row: carries the recurrence rule the app needs to offer
// "edit this and all following". Its schedule is the master's own schedule.
const SeriesInstanceRecurrenceSchema = z.strictObject({
  kind: z.literal("series"),
  rules: RRuleSchema,
});

// One projected (or overridden) instance of a series. recurrenceId is the
// instance's original scheduled start — the identity the write path uses to
// address exactly this occurrence. The owning series is `eventId`.
const OccurrenceInstanceRecurrenceSchema = z.strictObject({
  kind: z.literal("occurrence"),
  recurrenceId: DateTimeSchema,
});

export const SyncInstanceRecurrenceSchema = z.discriminatedUnion("kind", [
  SingleInstanceRecurrenceSchema,
  SeriesInstanceRecurrenceSchema,
  OccurrenceInstanceRecurrenceSchema,
]);
export type SyncInstanceRecurrence = z.infer<
  typeof SyncInstanceRecurrenceSchema
>;

export const SyncEventInstanceSchema = z.strictObject({
  // The real id of the owning event: the single, or the series master that
  // owns a `series`/`occurrence` row. Never a synthesized id — the backend
  // composes any app-facing per-occurrence id from (eventId, recurrenceId).
  eventId: EventIdSchema,
  calendarId: SyncEventCalendarIdSchema,
  content: SyncInstanceContentSchema,
  schedule: EventScheduleSchema,
  recurrence: SyncInstanceRecurrenceSchema,
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
  // The provider's cross-copy correlation key, lifted out of the ownership
  // metadata bag so consumers get a plain scalar. Copies of one meeting on
  // different accounts share it. Absent when the provider reported none.
  icalUid: z.string().optional(),
  // The provider owns this event's details and schedule. Omitted rather than
  // nulled so events imported before it was recorded stay contract-valid.
  providerManaged: z.literal(true).optional(),
});
export type SyncEventInstance = z.infer<typeof SyncEventInstanceSchema>;

// Query for the full-fidelity read. Identical range/paging shape to the
// occurrence feed, kept as its own schema so the two endpoints stay
// independently evolvable.
export const EventInstanceListQuerySchema = z
  .strictObject({
    calendarIds: z.array(SyncEventCalendarIdSchema).min(1).readonly(),
    start: DateTimeSchema,
    end: DateTimeSchema,
    cursor: z.string().trim().min(1).max(1024).optional(),
    limit: z.number().int().min(1).max(500).optional(),
  })
  .refine(({ start, end }) => Date.parse(end) > Date.parse(start), {
    message: "Range end must be after start",
    path: ["end"],
  });
export type EventInstanceListQuery = z.infer<
  typeof EventInstanceListQuerySchema
>;

export const EventInstanceListResponseSchema = z.strictObject({
  instances: z.array(SyncEventInstanceSchema).readonly(),
  nextCursor: z.string().trim().min(1).max(1024).nullable(),
});
export type EventInstanceListResponse = z.infer<
  typeof EventInstanceListResponseSchema
>;
