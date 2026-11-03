import { type WithId } from "mongodb";
import { type Schema_User } from "@core/types/user.types";
import dayjs from "@core/util/date/dayjs";
import { CONFIG } from "@backend/common/constants/config.constants";
import mongoService from "@backend/common/services/mongo.service";
import { emailSendRepository } from "@backend/email/email-send.repository";
import {
  nextReflectionSend,
  reflectionSendAt,
} from "@backend/email/reflection-schedule";

export function isReflectionTrialUser(userId: string): boolean {
  return Boolean(
    CONFIG.REFLECTION_TRIAL_USER_ID &&
      CONFIG.REFLECTION_TRIAL_EMAIL &&
      userId === CONFIG.REFLECTION_TRIAL_USER_ID,
  );
}

export function reflectionEligible(user: WithId<Schema_User>, trial: boolean) {
  return (
    CONFIG.REFLECTION_ENABLED &&
    !!CONFIG.EMAIL_PROVIDER &&
    !user.isSynthetic &&
    user.reflectionPreferences?.enabled === true &&
    !user.emailPreferences?.suppressedAt &&
    !user.emailPreferences?.reflectionDisabledAt &&
    (trial
      ? isReflectionTrialUser(user._id.toHexString())
      : CONFIG.REFLECTION_ROLLOUT_ENABLED)
  );
}

export async function enqueueDueReflections(now = new Date()) {
  if (!CONFIG.REFLECTION_ENABLED || !CONFIG.EMAIL_PROVIDER) return;
  // Trial configuration is fail-closed. General enrollment requires a separate gate.
  if (
    !CONFIG.REFLECTION_ROLLOUT_ENABLED &&
    (!CONFIG.REFLECTION_TRIAL_USER_ID || !CONFIG.REFLECTION_TRIAL_EMAIL)
  )
    return;
  const users = await mongoService.user
    .find({
      "reflectionPreferences.enabled": true,
      "emailPreferences.suppressedAt": { $exists: false },
      "emailPreferences.reflectionDisabledAt": { $exists: false },
      isSynthetic: { $ne: true },
      ...(!CONFIG.REFLECTION_ROLLOUT_ENABLED
        ? { _id: mongoService.objectId(CONFIG.REFLECTION_TRIAL_USER_ID) }
        : {}),
      $or: [
        { reflectionNextSendAt: { $lte: now } },
        { reflectionNextSendAt: { $exists: false } },
      ],
    })
    .sort({ reflectionNextSendAt: 1, _id: 1 })
    .limit(25)
    .toArray();
  for (const user of users) {
    const trial = isReflectionTrialUser(user._id.toHexString());
    if (!reflectionEligible(user, trial)) continue;
    const timeZone = user.reflectionPreferences!.timeZone;
    const cadence = trial ? ("daily" as const) : ("weekly" as const);
    const sendAt = nextReflectionSend(now, timeZone, cadence);
    if (sendAt <= now) {
      const date = dayjs(sendAt).tz(timeZone).format("YYYY-MM-DD");
      const recipientEmail = trial
        ? CONFIG.REFLECTION_TRIAL_EMAIL!
        : user.email;
      await emailSendRepository.insertMany([
        {
          _id: `reflection:${user._id.toHexString()}:${cadence}:${date}`,
          userId: user._id,
          sequence: "reflection",
          stepKey: cadence,
          sendAt: reflectionSendAt(date, timeZone),
          nextAttemptAt: now,
          status: "queued",
          recipientEmail,
          reflection: { date, timeZone, cadence, trial },
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
      sequence: "reflection",
      status: { $ne: "queued" },
      "reflection.prepared": { $exists: true },
      updatedAt: { $lt: new Date(now.getTime() - 7 * 86_400_000) },
    },
    { $unset: { "reflection.prepared": "" } },
  );
}
