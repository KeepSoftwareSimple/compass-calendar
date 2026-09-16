import { captureSafely } from "@core/logger/posthog-capture";
import { CONFIG } from "@backend/common/constants/config.constants";
import { getBackendPostHogClient } from "@backend/common/helpers/backend-posthog-client";

/**
 * Server-side billing events. The web app's `trial_converted` fires only when
 * the browser lands on the Checkout success redirect, so a user who pays and
 * closes the tab is invisible there. These come from the Stripe webhook and
 * are the source of truth for the PostHog billing funnel.
 */
export type BillingServerEvent = "checkout_completed" | "checkout_expired";

export const billingAnalytics = {
  /**
   * Best-effort capture keyed by the Compass user id, which is the same
   * distinct id the web app passes to `posthog.identify`, so server and
   * browser events land on one person. Never throws.
   */
  capture(input: {
    event: BillingServerEvent;
    userId: string;
    properties?: Record<string, boolean | number | string>;
  }): Promise<boolean> {
    return captureSafely(getBackendPostHogClient(), {
      event: input.event,
      distinctId: input.userId,
      properties: {
        environment: CONFIG.NODE_ENV,
        ...input.properties,
      },
    });
  },
};
