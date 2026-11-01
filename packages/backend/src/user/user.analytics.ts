import { captureSafely } from "@core/logger/posthog-capture";
import { serverPosthogEventProperties } from "@backend/common/analytics/server-posthog-capture.util";
import { getBackendPostHogClient } from "@backend/common/helpers/backend-posthog-client";

export type UserServerEvent = "account_deleted";

export const userAnalytics = {
  async capture(input: {
    event: UserServerEvent;
    userId: string;
    properties?: Record<string, boolean | number | string>;
  }): Promise<boolean> {
    return captureSafely(getBackendPostHogClient(), {
      event: input.event,
      distinctId: input.userId,
      properties: await serverPosthogEventProperties(
        input.userId,
        input.properties,
      ),
    });
  },
};
