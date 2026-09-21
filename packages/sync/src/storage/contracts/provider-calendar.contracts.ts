import { z } from "zod/v4";
import { HexColorSchema } from "@core/types/domain-primitives";
import {
  CalendarAccessRoleSchema,
  SyncCalendarCapabilitiesSchema,
} from "@core/types/sync/connection.contracts";
import {
  ConnectionIdSchema,
  PrincipalIdSchema,
  ProviderCalendarIdSchema,
  ProviderCalendarSourceIdSchema,
  TenantIdSchema,
} from "@core/types/sync/identity.contracts";

// One custom event-color label the calendar defines (Google's post-June-2026
// event labels; a provider without the concept reports none).
const EventLabelSchema = z.strictObject({
  id: z.string().trim().min(1).max(256),
  hex: HexColorSchema,
});

// Persistence record for `provider_calendars`. Provider FACTS
// only — `active`/`primary`/`accessRole`/`capabilities` reflect what the
// provider reports. Product preferences (visible, blocksAvailability,
// bookingTarget) are owned by the Compass booking module, never stored here —
// do not store product visibility or booking prefs.
export const ProviderCalendarRecordSchema = z.strictObject({
  _id: ProviderCalendarIdSchema,
  tenantId: TenantIdSchema,
  principalId: PrincipalIdSchema,
  connectionId: ConnectionIdSchema,
  providerCalendarId: ProviderCalendarSourceIdSchema,
  displayName: z.string().trim().min(1).max(1024),
  color: z.string().trim().min(1).max(64).nullable(),
  eventLabels: z.array(EventLabelSchema).readonly().default([]),
  active: z.boolean(),
  primary: z.boolean(),
  accessRole: CalendarAccessRoleSchema,
  capabilities: SyncCalendarCapabilitiesSchema,
  // Default true so documents discovered before this field existed still
  // promise Meet, matching Google's omitted conferenceProperties.
  createsGoogleMeet: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type ProviderCalendarRecord = z.infer<
  typeof ProviderCalendarRecordSchema
>;

// Reads parse through this stripped variant, not the strict schema above.
// A rolling deploy runs the old build and the new build together: the new
// build stamps a field the old build has never heard of, the old build then
// reads that row, and a strictObject rejects the unknown key
// (`unrecognized_keys`) and throws. Unknown keys are dropped from the
// in-memory record and left untouched in Mongo. Writes stay strict. Nested
// event labels are stripped on their own because Zod's unknown-key policy is
// per object.
export const ProviderCalendarReadSchema = ProviderCalendarRecordSchema.extend({
  eventLabels: z.array(EventLabelSchema.strip()).readonly().default([]),
}).strip();

export const ProviderCalendarUpsertSchema = ProviderCalendarRecordSchema.omit({
  _id: true,
  createdAt: true,
  updatedAt: true,
});
export type ProviderCalendarUpsert = z.infer<
  typeof ProviderCalendarUpsertSchema
>;
