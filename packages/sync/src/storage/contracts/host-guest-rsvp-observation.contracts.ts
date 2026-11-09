import { z } from "zod/v4";
import { EventIdSchema } from "@core/types/domain-primitives";
import { AttendeeResponseStatusSchema } from "@core/types/event-attendance.contracts";
import { zObjectId } from "@core/types/object-id.schema";
import {
  PrincipalIdSchema,
  TenantIdSchema,
} from "@core/types/sync/identity.contracts";

export const HostGuestRsvpObservationRecordSchema = z.strictObject({
  _id: zObjectId,
  tenantId: TenantIdSchema,
  principalId: PrincipalIdSchema,
  eventId: EventIdSchema,
  guestEmailLower: z.string().trim().min(1).max(320),
  guestName: z.string().trim().min(1).max(256),
  responseStatus: AttendeeResponseStatusSchema,
  slotStart: z.date(),
  firstObservedAt: z.date(),
});
export type HostGuestRsvpObservationRecord = z.infer<
  typeof HostGuestRsvpObservationRecordSchema
>;
