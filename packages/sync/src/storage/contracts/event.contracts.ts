import { z } from "zod/v4";
import { EventIdSchema } from "@core/types/domain-primitives";
import { EventScheduleSchema } from "@core/types/event.contracts";
import {
  ClientEventIdSchema,
  ProviderDeliveryStateSchema,
  ProviderEventVersionSchema,
  SyncEventCalendarIdSchema,
  SyncEventContentSchema,
  SyncEventLifecycleStateSchema,
  SyncEventOriginSchema,
  SyncEventRecurrenceSchema,
} from "@core/types/sync/event.contracts";
import {
  ConnectionIdSchema,
  PrincipalIdSchema,
  ProviderEventIdSchema,
  TenantIdSchema,
} from "@core/types/sync/identity.contracts";

const EventCustomizationsSchema = z.strictObject({
  title: z.string().optional(),
  description: z.string().optional(),
  location: z.string().nullable().optional(),
});

// Persistence record for `events`. Provider ownership is stored
// FLAT at top level (not nested under `ownership` like the wire contract)
// so the unique provider-identity index and the principal_calendar index match
// where the fields live. Unlinked Compass events keep provider fields null; the
// partialFilterExpression unique index only applies to a real providerEventId,
// so many unlinked events coexist. The query API maps this
// flat record back to the nested ownership union.
export const EventRecordSchema = z.strictObject({
  _id: EventIdSchema,
  tenantId: TenantIdSchema,
  principalId: PrincipalIdSchema,
  origin: SyncEventOriginSchema,
  // The owning calendar — a Compass calendar id for an unlinked event or a
  // provider calendar id once linked. Always present.
  calendarId: SyncEventCalendarIdSchema,
  clientEventId: ClientEventIdSchema.nullable(),
  // Provider ownership: all null for an unlinked Compass event, all set once
  // linked to exactly one provider calendar.
  connectionId: ConnectionIdSchema.nullable(),
  providerEventId: ProviderEventIdSchema.nullable(),
  providerVersion: ProviderEventVersionSchema.nullable(),
  providerUpdatedAt: z.date().nullable(),
  deliveryState: ProviderDeliveryStateSchema.nullable(),
  providerMetadata: z.record(z.string(), z.string()).nullable(),
  // Compass overlays for provider-managed events: served over the provider's
  // title, description, and location while schedule follows the provider.
  customizations: EventCustomizationsSchema.nullable().optional(),
  content: SyncEventContentSchema,
  schedule: EventScheduleSchema,
  recurrence: SyncEventRecurrenceSchema,
  lifecycleState: SyncEventLifecycleStateSchema,
  // Import generation. A non-destructive repair imports into a new
  // generation and only removes the old one after the replacement completes,
  // so both can coexist transiently.
  generation: z.number().int().min(0),
  createdAt: z.date(),
  updatedAt: z.date(),
  confirmedAt: z.date().nullable(),
});
export type EventRecord = z.infer<typeof EventRecordSchema>;

// Reads parse through this stripped variant, not the strict schema above.
// A rolling deploy runs the old build and the new build together: the new
// build stamps a field the old build has never heard of, the old build then
// reads that row, and a strictObject rejects the unknown key
// (`unrecognized_keys`) and throws. Unknown keys are dropped from the
// in-memory record and left untouched in Mongo. Writes stay strict. Nested
// customizations is stripped on its own because Zod's unknown-key policy is
// per object.
export const EventReadSchema = EventRecordSchema.extend({
  customizations: EventCustomizationsSchema.strip().nullable().optional(),
}).strip();
