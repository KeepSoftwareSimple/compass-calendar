import { z } from "zod/v4";
import { zObjectId } from "@core/types/type.utils";

export const HiddenEventRecordSchema = z.object({
  _id: zObjectId,
  userId: zObjectId,
  eventId: z.string().min(1).max(256),
  createdAt: z.date(),
});
export type HiddenEventRecord = z.infer<typeof HiddenEventRecordSchema>;
