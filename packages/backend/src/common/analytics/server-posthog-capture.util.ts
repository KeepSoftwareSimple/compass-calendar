import { CONFIG } from "@backend/common/constants/config.constants";
import { posthogSyntheticFlagsForCompassUserId } from "@backend/user/posthog-synthetic-account.util";

export async function serverPosthogEventProperties(
  userId: string,
  properties?: Record<string, boolean | number | string>,
): Promise<Record<string, boolean | number | string>> {
  const syntheticFlags = await posthogSyntheticFlagsForCompassUserId(userId);
  return {
    environment: CONFIG.NODE_ENV,
    ...properties,
    ...syntheticFlags,
  };
}
