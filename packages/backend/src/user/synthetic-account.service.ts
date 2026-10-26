import { isSyntheticAccountEmail } from "@core/analytics/synthetic-account.util";
import { CONFIG } from "@backend/common/constants/config.constants";
import { isSyntheticSignupFromRequestHeader } from "@backend/common/context/synthetic-signup.context";
import mongoService from "@backend/common/services/mongo.service";

export function resolveSyntheticAccountFromEmail(
  email: string,
  existingIsSynthetic?: boolean,
): boolean {
  if (existingIsSynthetic) return true;
  if (isSyntheticSignupFromRequestHeader()) return true;
  return isSyntheticAccountEmail(email, CONFIG.SYNTHETIC_JOURNEY_EMAILS);
}

/** Staging/prod journey and automation accounts skip billing gates without Stripe. */
export function isSyntheticBillingBypassAccount(
  email: string | undefined,
  isSynthetic?: boolean,
): boolean {
  if (isSynthetic === true) return true;
  if (!email) return false;
  return isSyntheticAccountEmail(email, CONFIG.SYNTHETIC_JOURNEY_EMAILS);
}

export async function isSyntheticCompassUserId(
  userId: string,
): Promise<boolean> {
  const _id = mongoService.objectId(userId);
  const user = await mongoService.user.findOne(
    { _id },
    { projection: { email: 1, isSynthetic: 1 } },
  );
  if (!user) return false;
  if (user.isSynthetic === true) return true;
  return isSyntheticAccountEmail(user.email, CONFIG.SYNTHETIC_JOURNEY_EMAILS);
}
