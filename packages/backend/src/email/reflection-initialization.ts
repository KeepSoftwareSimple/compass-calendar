import { type ObjectId } from "mongodb";
import { type ReflectionPreferences } from "@core/types/life-preferences.contracts";
import dayjs from "@core/util/date/dayjs";
import { CONFIG } from "@backend/common/constants/config.constants";
import mongoService from "@backend/common/services/mongo.service";
import { isReflectionTrialUser } from "@backend/email/reflection-enrollment";
import { reflectionSendAt } from "@backend/email/reflection-schedule";

/** Initialize only the new onboarding cohort; an explicit pause always wins. */
export async function initializeReflectionPreferences(
  userId: ObjectId,
  input: Omit<ReflectionPreferences, "enabled">,
) {
  if (
    !CONFIG.EMAIL_PROVIDER ||
    !CONFIG.REFLECTION_ENABLED ||
    (!CONFIG.REFLECTION_ROLLOUT_ENABLED &&
      !isReflectionTrialUser(userId.toHexString()))
  )
    return;
  const onboarding = await mongoService.emailSend.findOne({
    userId,
    sequence: "welcome",
    stepKey: "weekly-review",
    status: "queued",
  });
  if (!onboarding) return;
  const introductionDate = dayjs(onboarding.sendAt).tz(input.timeZone);
  const firstSunday = introductionDate
    .add(7 - introductionDate.day(), "day")
    .format("YYYY-MM-DD");
  await mongoService.user.updateOne(
    {
      _id: userId,
      reflectionPreferences: { $exists: false },
      isSynthetic: { $ne: true },
      "emailPreferences.reflectionDisabledAt": { $exists: false },
      "emailPreferences.suppressedAt": { $exists: false },
      "emailPreferences.unsubscribedAt": { $exists: false },
    },
    {
      $set: {
        reflectionPreferences: { ...input, enabled: true },
        reflectionNextSendAt: reflectionSendAt(firstSunday, input.timeZone),
      },
    },
  );
}
