import { z } from "zod/v4";
import { DateTimeSchema, EventIdSchema } from "@core/types/domain-primitives";
import { AttendeeResponseStatusSchema } from "@core/types/event-attendance.contracts";
import { ConnectionStateSchema } from "@core/types/sync/connection.contracts";
import { SyncEventCalendarIdSchema } from "@core/types/sync/event.contracts";
import { ConnectionIdSchema } from "@core/types/sync/identity.contracts";

// HTTP responses (and nested objects they contain) use z.object so a rolling
// deploy cannot 502 on a field the other side has not seen yet. Request
// bodies, command payloads, and upserts stay z.strictObject.

// Why the caller wants the busy data. The caller sends its intent (and a
// matching maxAge); Sync reports the same freshness facts either way — the
// booking decision is the caller's.
export const BusyQueryPurposeSchema = z.enum([
  "display",
  "booking_confirmation",
]);
export type BusyQueryPurpose = z.infer<typeof BusyQueryPurposeSchema>;

// The longest window a single busy query may span, so no request can force an
// unbounded scan.
export const BUSY_QUERY_MAX_WINDOW_MS = 60 * 24 * 60 * 60 * 1000;

// Request for the busy-availability query. The window is half-open [start, end)
// and bounded to 60 days; calendarIds are the blocking calendars.
export const BusyAvailabilityRequestSchema = z
  .strictObject({
    calendarIds: z.array(SyncEventCalendarIdSchema).min(1).max(100),
    start: DateTimeSchema,
    end: DateTimeSchema,
    // The oldest a calendar's last successful sync may be and still count fresh.
    maxAgeMs: z.number().int().positive(),
    purpose: BusyQueryPurposeSchema,
    // Compass-local calendar ids: cloud-only events at generation 0, no
    // provider resource. Any other missing resource stays notImported.
    unbackedCalendarIds: z.array(SyncEventCalendarIdSchema).max(100).optional(),
    // Drop these Compass event ids before merge. Unknown ids are ignored.
    // Omit or pass [] for today's merge behavior. Event ids never appear on
    // the busy response wire.
    excludeEventIds: z.array(EventIdSchema).max(100).optional(),
  })
  .refine((r) => Date.parse(r.end) > Date.parse(r.start), {
    message: "end must be after start",
    path: ["end"],
  })
  .refine(
    (r) => Date.parse(r.end) - Date.parse(r.start) <= BUSY_QUERY_MAX_WINDOW_MS,
    { message: "window must not exceed 60 days", path: ["end"] },
  );
export type BusyAvailabilityRequest = z.infer<
  typeof BusyAvailabilityRequestSchema
>;

// A normalized half-open busy interval on the wire (ISO instants).
// Occupancy facts are optional so display callers can keep {start,end} only.
// Booking uses hostIsOrganizer / hostResponseStatus; emails never appear.
export const BusyIntervalSchema = z.object({
  start: DateTimeSchema,
  end: DateTimeSchema,
  hostIsOrganizer: z.boolean().optional(),
  hostResponseStatus: AttendeeResponseStatusSchema.nullable().optional(),
});

// Why a requested calendar's busy data could not be freshly included.
export const CalendarFreshnessIssueReasonSchema = z.enum([
  "notImported",
  "neverSynced",
  "stale",
]);

export const CalendarIssueSchema = z.object({
  calendarId: SyncEventCalendarIdSchema,
  reason: CalendarFreshnessIssueReasonSchema,
});

// Freshness evidence for one connection backing a requested calendar. State and
// timestamps are reported as-is; the caller decides how to use them.
export const ConnectionFreshnessSchema = z.object({
  connectionId: ConnectionIdSchema,
  state: ConnectionStateSchema,
  lastSyncedAt: DateTimeSchema.nullable(),
  lastHealthyAt: DateTimeSchema.nullable(),
});

// Busy intervals plus the freshness/completeness/bookability evidence. Event
// titles, descriptions, locations, attendees, and conference links never appear.
export const BusyAvailabilityResponseSchema = z.object({
  intervals: z.array(BusyIntervalSchema),
  computedAt: DateTimeSchema,
  connections: z.array(ConnectionFreshnessSchema),
  complete: z.boolean(),
  issues: z.array(CalendarIssueSchema),
  bookable: z.boolean(),
});
export type BusyAvailabilityResponse = z.infer<
  typeof BusyAvailabilityResponseSchema
>;
