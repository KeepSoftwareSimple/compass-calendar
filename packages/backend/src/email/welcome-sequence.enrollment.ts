import { type ClientSession, type ObjectId } from "mongodb";
import { CONFIG } from "@backend/common/constants/config.constants";
import mongoService from "@backend/common/services/mongo.service";
import { emailSendRepository } from "@backend/email/email-send.repository";
import { buildWelcomeEnrollmentRows } from "@backend/email/welcome-sequence";
import { isPreviewLoopRecipient } from "@backend/email/welcome-sequence.preview-loop";

export function isWelcomeEmailEnabled(): boolean {
  return CONFIG.EMAIL_PROVIDER !== undefined;
}

export async function enrollWelcomeSequenceForNewUser(
  userId: ObjectId,
  signedUpAt: Date,
  isNewUser: boolean,
  session?: ClientSession,
): Promise<void> {
  if (!isNewUser || !isWelcomeEmailEnabled()) {
    return;
  }

  const user = await mongoService.user.findOne(
    { _id: userId },
    { projection: { email: 1 } },
  );
  if (user?.email && isPreviewLoopRecipient(user.email)) {
    return;
  }

  const profile = CONFIG.EMAIL_SCHEDULE_PROFILE ?? "real";
  const rows = buildWelcomeEnrollmentRows(userId, signedUpAt, profile);
  await emailSendRepository.insertMany(rows, session);
}
