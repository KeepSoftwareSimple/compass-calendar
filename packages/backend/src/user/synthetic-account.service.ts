import { isBillingAutomationBypassEmail } from "@core/analytics/synthetic-account.util";
import { CONFIG } from "@backend/common/constants/config.constants";
import { isSyntheticSignupFromRequestHeader } from "@backend/common/context/synthetic-signup.context";
import mongoService from "@backend/common/services/mongo.service";

/**
 * `isSyntheticAccount` plus the request header, for the signup and enrollment
 * paths that run inside a request and can still flag the account.
 */
export function resolveSyntheticAccountFromEmail(
  email: string,
  existingIsSynthetic?: boolean,
): boolean {
  if (existingIsSynthetic) return true;
  if (isSyntheticSignupFromRequestHeader()) return true;
  return isBillingAutomationBypassEmail(email, CONFIG.SYNTHETIC_JOURNEY_EMAILS);
}

/**
 * Journey and automation accounts: flagged on the user, or matching a
 * configured journey / test inbox. Billing uses this to skip Stripe gates;
 * email dispatch uses it to skip product mail.
 */
export function isSyntheticAccount(
  email: string | undefined,
  isSynthetic?: boolean,
): boolean {
  if (isSynthetic === true) return true;
  if (!email) return false;
  return isBillingAutomationBypassEmail(email, CONFIG.SYNTHETIC_JOURNEY_EMAILS);
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
  return isSyntheticAccount(user.email, user.isSynthetic);
}
