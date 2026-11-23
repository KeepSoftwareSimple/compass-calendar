import { type WithId } from "mongodb";
import { type Schema_User } from "@core/types/user.types";
import dayjs from "@core/util/date/dayjs";
import { CONFIG } from "@backend/common/constants/config.constants";
import mongoService from "@backend/common/services/mongo.service";
import { emailSendRepository } from "@backend/email/email-send.repository";
import { isEmailSequenceStopped } from "@backend/email/email-unsubscribe";
import {
  nextReflectionSend,
  reflectionSendAt,
} from "@backend/email/reflection-schedule";

export function reflectionEligible(user: WithId<Schema_User>) {
  return (
    CONFIG.REFLECTION_ENABLED &&
    !!CONFIG.EMAIL_PROVIDER &&
    !user.isSynthetic &&
    user.reflectionPreferences?.enabled === true &&
    // One owning rule for "this account has opted out of email", so a global
    // unsubscribe stops reviews the way `reflectionDisabledAt` does.
    !isEmailSequenceStopped(user.emailPreferences) &&
    !user.emailPreferences?.reflectionDisabledAt
  );
}

/** Reviews are opt-in only: nobody is enrolled here, only users who chose it. */
export async function enqueueDueReflections(now = new Date()) {
  if (!CONFIG.REFLECTION_ENABLED || !CONFIG.EMAIL_PROVIDER) return;
  const users = await mongoService.user
    .find({
      "reflectionPreferences.enabled": true,
      "emailPreferences.suppressedAt": { $exists: false },
      "emailPreferences.unsubscribedAt": { $exists: false },
      "emailPreferences.reflectionDisabledAt": { $exists: false },
      isSynthetic: { $ne: true },
      $or: [
        { reflectionNextSendAt: { $lte: now } },
        { reflectionNextSendAt: { $exists: false } },
      ],
    })
    .sort({ reflectionNextSendAt: 1, _id: 1 })
    .limit(25)
    .toArray();
  for (const user of users) {
    const timeZone = user.reflectionPreferences!.timeZone;
    if (!reflectionEligible(user)) continue;
    const cadence = "weekly" as const;
    const sendAt = nextReflectionSend(now, timeZone, cadence);
    if (sendAt <= now) {
      const date = dayjs(sendAt).tz(timeZone).format("YYYY-MM-DD");
      const existing = await mongoService.emailSend.findOne({
        userId: user._id,
        sequence: "reflection",
        "reflection.date": date,
        $or: [
          { status: "sent" },
          { status: "queued", "reflection.cadence": "weekly" },
        ],
      });
      if (!existing)
        await emailSendRepository.insertMany([
          {
            _id: `reflection:${user._id.toHexString()}:${cadence}:${date}`,
            userId: user._id,
            sequence: "reflection",
            stepKey: cadence,
            sendAt: reflectionSendAt(date, timeZone),
            nextAttemptAt: now,
            status: "queued",
            recipientEmail: user.email,
            reflection: { date, timeZone, cadence },
          },
        ]);
    }
    const next =
      sendAt > now
        ? sendAt
        : nextReflectionSend(
            new Date(sendAt.getTime() + 2 * 60 * 60 * 1000),
            timeZone,
            cadence,
          );
    await mongoService.user.updateOne(
      { _id: user._id, "reflectionPreferences.timeZone": timeZone },
      { $set: { reflectionNextSendAt: next } },
    );
  }
  // Do not retain personal payloads on terminal rows beyond their useful window.
  await mongoService.emailSend.updateMany(
    {
      status: { $ne: "queued" },
      "reflection.prepared": { $exists: true },
      updatedAt: { $lt: new Date(now.getTime() - 7 * 86_400_000) },
    },
    { $unset: { "reflection.prepared": "" } },
  );
}
