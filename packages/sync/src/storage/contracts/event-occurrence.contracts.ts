import { z } from "zod/v4";
import { EventIdSchema } from "@core/types/domain-primitives";
import { EventScheduleSchema } from "@core/types/event.contracts";
import {
  OccurrenceKeySchema,
  SyncEventCalendarIdSchema,
} from "@core/types/sync/event.contracts";
import {
  PrincipalIdSchema,
  TenantIdSchema,
} from "@core/types/sync/identity.contracts";
import { ObjectIdStringSchema } from "@core/types/type.utils";

// Persistence record for `event_occurrences` — a derived,
// display-ready instance projected from an event/series within the rolling
// horizon. Never expand a non-ending series to completion; only
// the bounded window is materialized. tenantId/principalId are denormalized for
// scoped queries and the principal_start index; generation ties an occurrence
// to the import generation of its source event so a repair can rebuild in a new
// generation before removing the old one.
export const EventOccurrenceRecordSchema = z.strictObject({
  _id: ObjectIdStringSchema,
  tenantId: TenantIdSchema,
  principalId: PrincipalIdSchema,
  eventId: EventIdSchema,
  occurrenceKey: OccurrenceKeySchema,
  calendarId: SyncEventCalendarIdSchema,
  schedule: EventScheduleSchema,
  // Normalized start instant for range queries and the start-time indexes.
  // Computed by the projection layer (the caller) so all-day and timed
  // occurrences compare on one coherent axis — string-comparing the union
  // schedule.start would be wrong across schedule kinds and offsets.
  startAt: z.date(),
  // Normalized EXCLUSIVE end instant, paired with startAt as a half-open
  // [startAt, endAt) interval so a busy/overlap query can find an occurrence
  // that starts before a window but ends inside it. Required: the #2303
  // rollout gap is closed — steady-state reprojection rewrote every pre-field
  // doc (prod and staging verified at zero missing on 2026-08-07).
  endAt: z.date(),
  busy: z.boolean(),
  title: z.string(),
  cancelled: z.boolean(),
  generation: z.number().int().min(0),
});
export type EventOccurrenceRecord = z.infer<typeof EventOccurrenceRecordSchema>;

// Reads parse through this stripped variant, not the strict schema above.
// A rolling deploy runs the old build and the new build together: the new
// build stamps a field the old build has never heard of, the old build then
// reads that row, and a strictObject rejects the unknown key
// (`unrecognized_keys`) and throws. Unknown keys are dropped from the
// in-memory record and left untouched in Mongo. Writes stay strict.
export const EventOccurrenceReadSchema = EventOccurrenceRecordSchema.strip();
