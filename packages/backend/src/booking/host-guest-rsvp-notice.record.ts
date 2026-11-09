import { z } from "zod/v4";
import { zObjectId } from "@core/types/object-id.schema";

const ObjectIdSchema = zObjectId;

export const HostGuestRsvpNoticeStateRecordSchema = z.strictObject({
  _id: ObjectIdSchema,
  userId: ObjectIdSchema,
  noticedAt: z.date().optional(),
  noticedObservationId: ObjectIdSchema.optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type HostGuestRsvpNoticeStateRecord = z.infer<
  typeof HostGuestRsvpNoticeStateRecordSchema
>;
