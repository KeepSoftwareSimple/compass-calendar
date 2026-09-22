import { type ObjectId } from "mongodb";
import { zObjectId } from "@core/types/object-id.schema";
import mongoService from "@backend/common/services/mongo.service";
import { emailAnalytics } from "@backend/email/email.analytics";
import { emailSendRepository } from "@backend/email/email-send.repository";

export async function markUserUnsubscribed(userId: ObjectId): Promise<void> {
  const now = new Date();
  await mongoService.user.updateOne(
    { _id: userId },
    {
      $set: {
        "emailPreferences.unsubscribedAt": now,
      },
    },
  );
  await emailSendRepository.cancelQueuedForUser(userId);
  void emailAnalytics.capture({
    event: "email_unsubscribed",
    userId: userId.toHexString(),
    step: await emailSendRepository.findLastSentStepKey(userId),
  });
}

export async function markUserSuppressed(userId: ObjectId): Promise<void> {
  const now = new Date();
  await mongoService.user.updateOne(
    { _id: userId },
    {
      $set: {
        "emailPreferences.suppressedAt": now,
      },
    },
  );
  await emailSendRepository.cancelQueuedForUser(userId);
}

export async function resolveUserIdFromUnsubscribeToken(
  token: string,
  parseUserId: (token: string) => string | null,
): Promise<ObjectId | null> {
  const userId = parseUserId(token);
  if (!userId) {
    return null;
  }
  try {
    return zObjectId.parse(userId);
  } catch {
    return null;
  }
}
