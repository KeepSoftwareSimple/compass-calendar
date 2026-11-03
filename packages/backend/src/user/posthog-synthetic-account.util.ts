import {
  isSyntheticAccountEmail,
  syntheticAccountPosthogFlags,
} from "@core/analytics/synthetic-account.util";
import { CONFIG } from "@backend/common/constants/config.constants";
import mongoService from "@backend/common/services/mongo.service";

/** PostHog tagging (includes `@compasscaltest.invalid` and journey inboxes). */
export function isPosthogSyntheticAccount(
  email: string | undefined,
  isSynthetic?: boolean,
): boolean {
  if (isSynthetic === true) return true;
  if (!email) return false;
  return isSyntheticAccountEmail(email, CONFIG.SYNTHETIC_JOURNEY_EMAILS);
}

export async function posthogSyntheticFlagsForCompassUserId(
  userId: string,
): Promise<Record<string, boolean>> {
  const _id = mongoService.objectId(userId);
  const user = await mongoService.user.findOne(
    { _id },
    { projection: { email: 1, isSynthetic: 1 } },
  );
  if (!user) return {};
  if (isPosthogSyntheticAccount(user.email, user.isSynthetic)) {
    return syntheticAccountPosthogFlags();
  }
  return {};
}
