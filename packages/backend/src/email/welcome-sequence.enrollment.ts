import { type ClientSession, type ObjectId } from "mongodb";
import { CONFIG } from "@backend/common/constants/config.constants";
import { emailSendRepository } from "@backend/email/email-send.repository";
import { buildWelcomeEnrollmentRows } from "@backend/email/welcome-sequence";

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

  const profile = CONFIG.EMAIL_SCHEDULE_PROFILE ?? "real";
  const rows = buildWelcomeEnrollmentRows(userId, signedUpAt, profile);
  await emailSendRepository.insertMany(rows, session);
}
