import { captureSafely } from "@core/logger/posthog-capture";
import {
  type EmailSendServerEvent,
  EmailSendServerEventSchema,
} from "@core/types/email-lifecycle.contracts";
import { CONFIG } from "@backend/common/constants/config.constants";
import { getBackendPostHogClient } from "@backend/common/helpers/backend-posthog-client";

/**
 * Server-side welcome sequence email events. Keyed by the Compass user id so
 * these land on the same person as browser events. Never throws.
 */
export const emailAnalytics = {
  capture(input: {
    event: EmailSendServerEvent;
    userId: string;
    step?: string;
    properties?: Record<string, boolean | number | string>;
  }): Promise<boolean> {
    EmailSendServerEventSchema.parse(input.event);
    const properties: Record<string, boolean | number | string> = {
      environment: CONFIG.NODE_ENV,
      ...input.properties,
    };
    if (input.step) {
      properties["step"] = input.step;
    }
    return captureSafely(getBackendPostHogClient(), {
      event: input.event,
      distinctId: input.userId,
      properties,
    });
  },
};
