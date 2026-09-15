import { z } from "zod/v4";
import {
  EVENT_TITLE_SEARCH_MAX,
  EVENT_TITLE_SEARCH_MIN,
} from "@core/event/search-events-by-title";
import {
  CalendarIdSchema,
  DateTimeSchema,
  EventIdSchema,
  RRuleSchema,
} from "@core/types/domain-primitives";
import {
  BusyPeriodSchema,
  EditableRecurrenceSchema,
  EventScheduleSchema,
  EventSchema,
} from "@core/types/event.contracts";
import {
  AttendeeInputSchema,
  RsvpResponseStatusSchema,
  uniqueAttendeeEmails,
} from "@core/types/event-attendance.contracts";
import { OptionalNullableEventColorSchema } from "@core/types/event-color.contracts";

// Whether saving (or deleting) this event should have the provider email
// attendees about it. Same vocabulary as sync's InvitationIntentSchema, which
// derives from this, but undefaulted: on the browser API the field is truly
// optional, so a legacy payload parses to an identical output and the backend
// keeps deciding what "absent" means (today: none).
export const InvitationIntentValueSchema = z.enum([
  "all",
  "externalOnly",
  "none",
]);

const EditableContentSchema = z.strictObject({
  kind: z.literal("details"),
  title: z.string(),
  description: z.string(),
  // Same convention as description: empty string means no location, always
  // sent and always overwritten on save (no separate "leave alone" state -
  // location has no calendar-default to inherit the way color does).
  location: z.string(),
  // Null clears a previously set color on replace; omit leaves sync color
  // alone when the client did not touch it.
  color: OptionalNullableEventColorSchema,
  // Guest-list edit signal: omitted means "not editing guests" (provider
  // attendees flow through untouched — today's behavior); present, including
  // [], means "replace membership with exactly this set". One entry per email,
  // case-insensitive. Readonly like the read-side lists so a replayed
  // Event["content"] stays structurally assignable to this input.
  attendees: z
    .array(AttendeeInputSchema)
    .readonly()
    .refine(uniqueAttendeeEmails, {
      message: "Attendee emails must be unique",
    })
    .optional(),
});

export const RecurrenceScopeSchema = z.enum([
  "this",
  "thisAndFollowing",
  "all",
]);
export type RecurrenceScope = z.infer<typeof RecurrenceScopeSchema>;

export const RecurrenceEditSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("preserve") }),
  z.strictObject({ kind: z.literal("single") }),
  z.strictObject({ kind: z.literal("series"), rules: RRuleSchema }),
]);
export type RecurrenceEdit = z.infer<typeof RecurrenceEditSchema>;

export const CreateEventInputSchema = z.strictObject({
  // Optional client-generated id (A25): preserves optimistic creation and
  // undo-of-delete, which restores an event under its original id. The server
  // enforces uniqueness and rejects an id that already exists.
  id: EventIdSchema.optional(),
  calendarId: CalendarIdSchema,
  content: EditableContentSchema,
  schedule: EventScheduleSchema,
  recurrence: EditableRecurrenceSchema,
  // Undo/redo replay marker: this submission is fresh user intent that may
  // collide with a terminal command sharing its idempotency key (undo-of-
  // delete recreating under the same event id). Sync reopens the collided
  // command instead of treating the resubmission as a no-op replay. Never
  // set by a normal create or by offline-promotion retries.
  restore: z.literal(true).optional(),
  // Whether the provider should email invitations for this save. Omitted means
  // the backend's default (today: none). Only meaningful when the guest set
  // changed.
  invitation: InvitationIntentValueSchema.optional(),
});
export type CreateEventInput = z.infer<typeof CreateEventInputSchema>;

export const ReplaceEventInputSchema = z.strictObject({
  // Destination calendar for a cross-calendar move (drag between Day-view
  // columns). Omitted or equal to the event's current calendar means no
  // move. Only single (non-recurring) events may move; the server rejects
  // moves for series/occurrences.
  calendarId: CalendarIdSchema.optional(),
  content: EditableContentSchema,
  schedule: EventScheduleSchema,
  recurrence: RecurrenceEditSchema,
  scope: RecurrenceScopeSchema,
  // Same undo/redo replay marker as CreateEventInputSchema.restore, for
  // replayed edits and redo-of-edit (both hit the same colliding-key replay
  // problem on the update side).
  restore: z.literal(true).optional(),
  // Same save-time invitation choice as CreateEventInputSchema.invitation.
  invitation: InvitationIntentValueSchema.optional(),
});
export type ReplaceEventInput = z.infer<typeof ReplaceEventInputSchema>;

export const DeleteEventInputSchema = z.strictObject({
  scope: RecurrenceScopeSchema,
  // Whether the provider should email attendees the cancellation. Omitted
  // means the backend's default (today: none).
  invitation: InvitationIntentValueSchema.optional(),
});
export type DeleteEventInput = z.infer<typeof DeleteEventInputSchema>;

// RSVP to an event the user is invited to. The target rides on the request
// URL's event id — a composite occurrence id (`eventId::recurrenceId`)
// addresses one occurrence — and scope says whether the response covers just
// that occurrence ("single") or the whole series ("all"). For a non-recurring
// event the scope is always "single".
export const RsvpEventInputSchema = z.strictObject({
  responseStatus: RsvpResponseStatusSchema,
  scope: z.enum(["single", "all"]),
});
export type RsvpEventInput = z.infer<typeof RsvpEventInputSchema>;

export const EventListQuerySchema = z
  .strictObject({
    kind: z.literal("range"),
    start: DateTimeSchema,
    end: DateTimeSchema,
    // Optional server-side calendar scope. When present, the backend
    // intersects with calendars the principal owns (never trusts the client
    // blindly). Omitted keeps the legacy "all calendars" read for older
    // clients; the web passes visible calendar ids to avoid draining hidden
    // calendars on first paint.
    calendarIds: z.array(CalendarIdSchema).min(1).max(100).optional(),
    // Title substring search (palette). When set, the backend scans ±1 year
    // and returns at most 20 matches ordered by distance from now.
    q: z
      .string()
      .trim()
      .min(EVENT_TITLE_SEARCH_MIN)
      .max(EVENT_TITLE_SEARCH_MAX)
      .optional(),
  })
  .refine(({ start, end }) => Date.parse(end) > Date.parse(start), {
    message: "Range end must be after start",
    path: ["end"],
  })
  .refine(
    ({ calendarIds }) =>
      calendarIds === undefined ||
      new Set(calendarIds).size === calendarIds.length,
    { message: "Calendar ids must be unique", path: ["calendarIds"] },
  );
export type EventListQuery = z.infer<typeof EventListQuerySchema>;

export const EventResponseSchema = z.strictObject({ event: EventSchema });
export type EventResponse = z.infer<typeof EventResponseSchema>;

export const EventListResponseSchema = z.strictObject({
  events: z.array(EventSchema),
});
export type EventListResponse = z.infer<typeof EventListResponseSchema>;

export const AvailabilityQuerySchema = z
  .strictObject({
    calendarIds: z.array(CalendarIdSchema).min(1),
    start: DateTimeSchema,
    end: DateTimeSchema,
  })
  .refine(({ start, end }) => Date.parse(end) > Date.parse(start), {
    message: "Availability end must be after start",
    path: ["end"],
  })
  .refine(
    ({ calendarIds }) => new Set(calendarIds).size === calendarIds.length,
    { message: "Calendar ids must be unique", path: ["calendarIds"] },
  );
export type AvailabilityQuery = z.infer<typeof AvailabilityQuerySchema>;

export const AvailabilityResponseSchema = z.strictObject({
  busyPeriods: z.array(BusyPeriodSchema),
});
export type AvailabilityResponse = z.infer<typeof AvailabilityResponseSchema>;

export const EventMutationErrorCodeSchema = z.enum([
  "EVENT_NOT_FOUND",
  "CALENDAR_NOT_FOUND",
  "CALENDAR_READ_ONLY",
  "RECURRENCE_CONFLICT",
  "DUPLICATE_EVENT_ID",
  "INVALID_SCHEDULE",
  // The event id addressed a specific occurrence (it carried the `::`
  // composite separator) but failed to decode — never silently widen the
  // scope to the whole event/series for an id shaped like an occurrence
  // reference but malformed.
  "INVALID_OCCURRENCE_ID",
  "PROVIDER_FAILURE",
  // Sync itself was unreachable, timed out, or shed load (429/503) before the
  // command reached a provider. Distinct from PROVIDER_FAILURE, which means the
  // provider answered badly: this is our own backpressure, so it is a 503 and
  // always safe to retry with the same idempotency key.
  "SYNC_UNAVAILABLE",
  "GOOGLE_REVOKED",
  // Provider-neutral alias of GOOGLE_REVOKED. Both codes stay on the wire
  // until milestone C drops the Google-named one.
  "CONNECTION_REVOKED",
  // Scoped cutover maintenance: cloud/provider mutations paused (S50).
  "MAINTENANCE",
  // A replace tried to move a provider-linked event to a different calendar.
  // Sync has no executor for a "move" command yet (unconditionally fails it),
  // so this is rejected before any command is submitted — never retryable.
  "MOVE_UNSUPPORTED",
  // The provider refuses this operation for this event — e.g. Google rejects
  // deleting one occurrence of a contact-linked birthday (or other special)
  // event. The request was well-formed and the provider is healthy, so this
  // is neither INVALID_INPUT nor PROVIDER_FAILURE; retrying can never
  // succeed.
  "UNSUPPORTED_OPERATION",
  // The request body failed contract validation (e.g. an unrecognized key on
  // a strict schema). Always a client-side mistake, never retryable.
  "INVALID_INPUT",
  // The write carried `content.attendees` but the target calendar cannot
  // deliver a guest list — it is not a writable Google calendar (local/
  // anonymous calendars, read-only Google calendars). Rejected before any
  // sync submission; never retryable. The web hides the attendee editor in
  // these cases, so this is the backstop for hand-crafted requests.
  "ATTENDEES_UNSUPPORTED",
  // Cloud event writes require a trial or paid subscription. 403, not 401
  // (SuperTokens retries 401 after refresh) and not 402 (Status has no
  // PAYMENT_REQUIRED). Never retryable.
  "BILLING_REQUIRED",
]);

export const EventMutationErrorSchema = z.strictObject({
  code: EventMutationErrorCodeSchema,
  message: z.string().min(1),
  retryable: z.boolean(),
  connectionId: z.string().optional(),
});
export type EventMutationError = z.infer<typeof EventMutationErrorSchema>;
