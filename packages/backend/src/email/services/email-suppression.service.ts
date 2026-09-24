import { type ObjectId } from "mongodb";
import { zObjectId } from "@core/types/object-id.schema";
import mongoService from "@backend/common/services/mongo.service";
import { emailAnalytics } from "@backend/email/email.analytics";
import { emailSendRepository } from "@backend/email/email-send.repository";
import { parseUnsubscribeUserId } from "@backend/email/email-unsubscribe";

async function stampEmailPreference(
  userId: ObjectId,
  field: "unsubscribedAt" | "suppressedAt",
): Promise<void> {
  await mongoService.user.updateOne(
    { _id: userId },
    {
      $set: {
        [`emailPreferences.${field}`]: new Date(),
      },
    },
  );
  await emailSendRepository.cancelQueuedForUser(userId);
}

export async function markUserUnsubscribed(userId: ObjectId): Promise<void> {
  await stampEmailPreference(userId, "unsubscribedAt");
  void emailAnalytics.capture({
    event: "email_unsubscribed",
    userId: userId.toHexString(),
    step: await emailSendRepository.findLastSentStepKey(userId),
  });
}

export async function markUserSuppressed(userId: ObjectId): Promise<void> {
  await stampEmailPreference(userId, "suppressedAt");
}

export async function resolveUserIdFromUnsubscribeToken(
  token: string,
): Promise<ObjectId | null> {
  const userId = parseUnsubscribeUserId(token);
  if (!userId) {
    return null;
  }
  try {
    return zObjectId.parse(userId);
  } catch {
    return null;
  }
}
