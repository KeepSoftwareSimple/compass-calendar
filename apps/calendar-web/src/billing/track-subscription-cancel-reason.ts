import { type SubscriptionCancelReasonSlug } from "@core/billing/subscription-cancel-reason.constants";
import { type ProductEventProperties, track } from "@web/auth/posthog/track";

export type SubscriptionCancelReasonSubmission = {
  reason: SubscriptionCancelReasonSlug;
  details?: string;
};

/** Fire-and-forget; never throws. Call only when the user chose a reason. */
export function trackSubscriptionCancelReasonSubmitted(
  submission: SubscriptionCancelReasonSubmission,
): void {
  const properties: ProductEventProperties = {
    reason: submission.reason,
  };
  const trimmedDetails = submission.details?.trim();
  if (submission.reason === "other" && trimmedDetails) {
    properties.details = trimmedDetails;
  }
  track("subscription_cancel_reason_submitted", properties);
}
