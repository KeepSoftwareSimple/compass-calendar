import { type WithId } from "mongodb";
import { type ReflectionPreferences } from "@core/types/life-preferences.contracts";
import { type Schema_User } from "@core/types/user.types";
import { CONFIG } from "@backend/common/constants/config.constants";
import mongoService from "@backend/common/services/mongo.service";
import { emailAnalytics } from "@backend/email/email.analytics";
import { emailSendRepository } from "@backend/email/email-send.repository";
import { enqueueReflectionConfirmation } from "@backend/email/reflection-confirmation";
import { requestReflectionHistory } from "@backend/email/reflection-history";

export const reflectionAvailable = () =>
  !!CONFIG.EMAIL_PROVIDER && CONFIG.REFLECTION_ENABLED;

/** Why this account cannot turn reflections on, or null when it can. */
export function reflectionEnableBlock(user: WithId<Schema_User>) {
  if (!reflectionAvailable() || user.isSynthetic)
    return "Reflections are not available for this account";
  if (user.emailPreferences?.suppressedAt)
    return "Reflections are not available for this account";
  if (user.emailPreferences?.unsubscribedAt)
    return "You unsubscribed from all Compass emails. Reply to any Compass email to turn them back on.";
  return null;
}

/** The one place reflections are turned on or off after a user's own choice. */
export async function setReflectionEnabled(
  user: WithId<Schema_User>,
  preferences: ReflectionPreferences,
  source: "settings" | "email",
) {
  const id = user._id;
  await mongoService.user.updateOne(
    { _id: id },
    {
      $set: {
        reflectionPreferences: {
          ...preferences,
          ...(preferences.enabled ? { optedInAt: new Date() } : {}),
        },
        ...(!preferences.enabled
          ? { "emailPreferences.reflectionDisabledAt": new Date() }
          : {}),
      },
      $unset: {
        reflectionNextSendAt: "",
        ...(preferences.enabled
          ? { "emailPreferences.reflectionDisabledAt": "" }
          : {}),
      },
    },
  );
  await emailSendRepository.cancelQueuedReflection(id, !preferences.enabled);
  if (preferences.enabled) {
    // Confirm the channel once, before the first one, and start the history
    // import a first send depends on.
    if (!user.reflectionPreferences?.enabled)
      await enqueueReflectionConfirmation(user);
    void requestReflectionHistory(user);
  } else if (user.reflectionPreferences?.enabled) {
    void emailAnalytics.capture({
      event: "email_unsubscribed",
      userId: id.toHexString(),
      properties: { sequence: "reflection", source },
    });
  }
}
