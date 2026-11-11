import { z } from "zod/v4";
import { zObjectId } from "@core/types/object-id.schema";
import { PrincipalIdSchema } from "@core/types/sync/identity.contracts";
import { ObjectIdStringSchema } from "@core/types/type.utils";

export const HostGuestRsvpSummarizeRequestSchema = z.strictObject({
  principalId: PrincipalIdSchema,
  cursor: z.strictObject({
    firstObservedAt: z.iso.datetime({ offset: true }),
    observationId: ObjectIdStringSchema.optional(),
  }),
});
export type HostGuestRsvpSummarizeRequest = z.infer<
  typeof HostGuestRsvpSummarizeRequestSchema
>;

export const HostGuestRsvpSummarizeReplySchema = z.strictObject({
  id: zObjectId,
  guestName: z.string().trim().min(1).max(256),
  responseStatus: z.enum(["accepted", "declined", "tentative"]),
  slotStart: z.iso.datetime({ offset: true }),
  firstObservedAt: z.iso.datetime({ offset: true }),
});
export type HostGuestRsvpSummarizeReply = z.infer<
  typeof HostGuestRsvpSummarizeReplySchema
>;

export const HostGuestRsvpSummarizeResponseSchema = z.strictObject({
  count: z.number().int().nonnegative(),
  latest: HostGuestRsvpSummarizeReplySchema.nullable(),
});
export type HostGuestRsvpSummarizeResponse = z.infer<
  typeof HostGuestRsvpSummarizeResponseSchema
>;
