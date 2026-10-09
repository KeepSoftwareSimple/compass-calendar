import { z } from "zod/v4";
import {
  CalendarIdSchema,
  DateOnlySchema,
  DateTimeSchema,
  EventIdSchema,
  RRuleSchema,
  TimeZoneSchema,
} from "@core/types/domain-primitives";
import {
  AttendeeSchema,
  ConferenceSchema,
  OrganizerSchema,
} from "@core/types/event-attendance.contracts";
import {
  OptionalHexEventColorSchema,
  OptionalNullableEventColorSchema,
} from "@core/types/event-color.contracts";

export const EventContentSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("details"),
    title: z.string(),
    description: z.string(),
    // Read-only, provider-sourced. Optional so existing local records
    // (persisted before these fields existed) still parse.
    location: z.string().nullable().optional(),
    organizer: OrganizerSchema.nullable().optional(),
    attendees: z.array(AttendeeSchema).readonly().optional(),
    conference: ConferenceSchema.nullable().optional(),
    // Null clears a previously set color tag on replace. Reads omit the field
    // when there is no color.
    color: OptionalNullableEventColorSchema,
    // A provider-assigned custom color with no Compass slot equivalent.
    // Read-only: no write command ever sets this.
    colorHex: OptionalHexEventColorSchema,
  }),
  z.strictObject({ kind: z.literal("busy") }),
]);
export type EventContent = z.infer<typeof EventContentSchema>;

const TimedScheduleSchema = z
  .strictObject({
    kind: z.literal("timed"),
    start: DateTimeSchema,
    end: DateTimeSchema,
    timeZone: TimeZoneSchema,
  })
  // Zero-duration is valid (Google, Outlook, and RFC 5545 all allow start == end,
  // e.g. medication-reminder or deadline-marker events); only end < start is rejected.
  .refine(({ start, end }) => Date.parse(end) >= Date.parse(start), {
    message: "Timed event end must not be before start",
    path: ["end"],
  });

const AllDayScheduleSchema = z
  .strictObject({
    kind: z.literal("allDay"),
    start: DateOnlySchema,
    end: DateOnlySchema,
  })
  .refine(({ start, end }) => end > start, {
    message: "All-day event end is exclusive and must be after start",
    path: ["end"],
  });

export const EventScheduleSchema = z.discriminatedUnion("kind", [
  TimedScheduleSchema,
  AllDayScheduleSchema,
]);
export type EventSchedule = z.infer<typeof EventScheduleSchema>;

const SingleRecurrenceSchema = z.strictObject({
  kind: z.literal("single"),
});

const SeriesRecurrenceSchema = z.strictObject({
  kind: z.literal("series"),
  rules: RRuleSchema,
});

const OccurrenceRecurrenceSchema = z.strictObject({
  kind: z.literal("occurrence"),
  seriesId: EventIdSchema,
});

export const EditableRecurrenceSchema = z.discriminatedUnion("kind", [
  SingleRecurrenceSchema,
  SeriesRecurrenceSchema,
]);
export type EditableRecurrence = z.infer<typeof EditableRecurrenceSchema>;

export const EventRecurrenceSchema = z.discriminatedUnion("kind", [
  SingleRecurrenceSchema,
  SeriesRecurrenceSchema,
  OccurrenceRecurrenceSchema,
]);
export type EventRecurrence = z.infer<typeof EventRecurrenceSchema>;

export const EventSchema = z.strictObject({
  id: EventIdSchema,
  calendarId: CalendarIdSchema,
  content: EventContentSchema,
  schedule: EventScheduleSchema,
  recurrence: EventRecurrenceSchema,
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema.nullable(),
  // The provider's cross-copy correlation key. When the same meeting is on
  // two of the user's connected accounts, both copies carry the same value
  // (unlike `id`, which is per copy), so the grid can recognize them as one
  // meeting. Absent for events the provider reported none for, and for
  // locally created events.
  icalUid: z.string().optional(),
  // The provider owns this event's details and schedule. Omitted rather than
  // nulled so events imported before it was recorded stay contract-valid.
  providerManaged: z.literal(true).optional(),
  // Popup reminder offsets synced from the provider (minutes before start).
  // Omitted for local events and legacy rows; the notifier falls back to 5 minutes.
  popupReminderMinutes: z
    .array(z.number().int().min(0).max(40320))
    .readonly()
    .optional(),
});
export type Event = z.infer<typeof EventSchema>;

export const BusyPeriodSchema = z
  .strictObject({
    calendarId: CalendarIdSchema,
    start: DateTimeSchema,
    end: DateTimeSchema,
  })
  .refine(({ start, end }) => Date.parse(end) > Date.parse(start), {
    message: "Busy period end must be after start",
    path: ["end"],
  });
export type BusyPeriod = z.infer<typeof BusyPeriodSchema>;
