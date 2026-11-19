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

export function reflectionRolloutActive(timeZone = "UTC", now = new Date()) {
  return (
    CONFIG.REFLECTION_ROLLOUT_ENABLED &&
    (!CONFIG.REFLECTION_ROLLOUT_START_DATE ||
      dayjs(now).tz(timeZone).format("YYYY-MM-DD") >=
        CONFIG.REFLECTION_ROLLOUT_START_DATE)
  );
}

export function reflectionEligible(
  user: WithId<Schema_User>,
  trial: boolean,
  now = new Date(),
) {
  return (
    CONFIG.REFLECTION_ENABLED &&
    !!CONFIG.EMAIL_PROVIDER &&
    !user.isSynthetic &&
    user.reflectionPreferences?.enabled === true &&
    !user.emailPreferences?.suppressedAt &&
    !user.emailPreferences?.reflectionDisabledAt &&
    (trial
      ? isReflectionTrialUser(user._id.toHexString())
      : reflectionRolloutActive(user.reflectionPreferences?.timeZone, now))
  );
}

export async function enqueueDueReflections(now = new Date()) {
  if (!CONFIG.REFLECTION_ENABLED || !CONFIG.EMAIL_PROVIDER) return;
  // Explicitly authorized population enrollment, without overwriting pauses or
  // saved timezone/calendar choices. Legacy accounts without a timezone use UTC.
  if (CONFIG.REFLECTION_ROLLOUT_ENABLED && CONFIG.REFLECTION_ENROLL_EXISTING) {
    const start = CONFIG.REFLECTION_ROLLOUT_START_DATE
      ? reflectionSendAt(CONFIG.REFLECTION_ROLLOUT_START_DATE, "UTC")
      : now;
    await mongoService.user.updateMany(
      {
        reflectionPreferences: { $exists: false },
        isSynthetic: { $ne: true },
        "emailPreferences.suppressedAt": { $exists: false },
        "emailPreferences.unsubscribedAt": { $exists: false },
        "emailPreferences.reflectionDisabledAt": { $exists: false },
      },
      {
        $set: {
          reflectionPreferences: {
            enabled: true,
            timeZone: "UTC",
            excludedCalendarIds: [],
          },
          reflectionNextSendAt: nextReflectionSend(
            start > now ? start : now,
            "UTC",
            "weekly",
          ),
        },
      },
    );
  }
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
    const timeZone = user.reflectionPreferences!.timeZone;
    const trial =
      isReflectionTrialUser(user._id.toHexString()) &&
      !reflectionRolloutActive(timeZone, now);
    if (!reflectionEligible(user, trial, now)) {
      // Park prelaunch accounts at their first eligible Sunday so the bounded
      // query cannot repeatedly select them and starve the private recipient.
      if (CONFIG.REFLECTION_ROLLOUT_START_DATE && !trial) {
        const start = reflectionSendAt(
          CONFIG.REFLECTION_ROLLOUT_START_DATE,
          timeZone,
        );
        await mongoService.user.updateOne(
          {
            _id: user._id,
            "reflectionPreferences.timeZone": timeZone,
          },
          {
            $set: {
              reflectionNextSendAt: nextReflectionSend(
                start,
                timeZone,
                "weekly",
              ),
            },
          },
        );
      }
      continue;
    }
    const cadence = "weekly" as const;
    const sendAt = nextReflectionSend(now, timeZone, cadence);
    if (sendAt <= now) {
      const date = dayjs(sendAt).tz(timeZone).format("YYYY-MM-DD");
      const recipientEmail = trial
        ? CONFIG.REFLECTION_TRIAL_EMAIL!
        : user.email;
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
      status: { $ne: "queued" },
      "reflection.prepared": { $exists: true },
      updatedAt: { $lt: new Date(now.getTime() - 7 * 86_400_000) },
    },
    { $unset: { "reflection.prepared": "" } },
  );
}
