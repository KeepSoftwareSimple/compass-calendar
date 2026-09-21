import { z } from "zod/v4";
import { zObjectId } from "@core/types/object-id.schema";

export const EmailSendStatusSchema = z.enum([
  "queued",
  "sent",
  "skipped",
  "canceled",
  "failed",
]);
export type EmailSendStatus = z.infer<typeof EmailSendStatusSchema>;

export const EmailSendRecordSchema = z.strictObject({
  _id: z.string(),
  userId: zObjectId,
  sequence: z.literal("welcome"),
  stepKey: z.string().trim().min(1).max(64),
  status: EmailSendStatusSchema,
  sendAt: z.date(),
  attemptCount: z.number().int().nonnegative(),
  nextAttemptAt: z.date(),
  lastError: z.string().trim().max(500).nullable(),
  providerMessageId: z.string().nullable(),
  sentAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type EmailSendRecord = z.infer<typeof EmailSendRecordSchema>;
