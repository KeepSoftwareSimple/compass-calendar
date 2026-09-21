import { z } from "zod/v4";
import {
  ProviderEventVersionSchema,
  SyncEventCalendarIdSchema,
} from "@core/types/sync/event.contracts";
import {
  ConnectionIdSchema,
  PrincipalIdSchema,
  ProviderEventIdSchema,
  TenantIdSchema,
} from "@core/types/sync/identity.contracts";
import { ObjectIdStringSchema } from "@core/types/type.utils";

export const DeletionSourceSchema = z.enum(["compass", "provider"]);
export type DeletionSource = z.infer<typeof DeletionSourceSchema>;

// Persistence record for `deletion_markers` — the content-free memory of a
// confirmed deletion, kept only long enough to stop delayed sync work from
// resurrecting the event. A TTL index removes it after the retention window.
// Only provider identity and version are retained: no title, description,
// attendees, location, or conference data.
export const DeletionMarkerRecordSchema = z.strictObject({
  _id: ObjectIdStringSchema,
  tenantId: TenantIdSchema,
  principalId: PrincipalIdSchema,
  connectionId: ConnectionIdSchema,
  calendarId: SyncEventCalendarIdSchema,
  providerEventId: ProviderEventIdSchema,
  providerVersion: ProviderEventVersionSchema.nullable(),
  deletionSource: DeletionSourceSchema,
  deletedAt: z.date(),
  // When the TTL index removes this marker (deletedAt + retention window).
  expiresAt: z.date(),
});
export type DeletionMarkerRecord = z.infer<typeof DeletionMarkerRecordSchema>;

// Reads parse through this stripped variant, not the strict schema above.
// A rolling deploy runs the old build and the new build together: the new
// build stamps a field the old build has never heard of, the old build then
// reads that row, and a strictObject rejects the unknown key
// (`unrecognized_keys`) and throws. Unknown keys are dropped from the
// in-memory record and left untouched in Mongo. Writes stay strict.
export const DeletionMarkerReadSchema = DeletionMarkerRecordSchema.strip();

export const DeletionMarkerRecordInputSchema = DeletionMarkerRecordSchema.omit({
  _id: true,
  expiresAt: true,
});
export type DeletionMarkerRecordInput = z.infer<
  typeof DeletionMarkerRecordInputSchema
>;
