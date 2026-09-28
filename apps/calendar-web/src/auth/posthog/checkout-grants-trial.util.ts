import { type BillingStatusResponse } from "@core/types/billing.types";

/** Matches Stripe checkout trial fields in `stripe.service.ts`. */
const STRIPE_MIN_TRIAL_REMAINING_MS = 48 * 60 * 60 * 1000;

/** True when embedded Checkout will create or extend a Stripe trial (mirrors server `trial`). */
export function checkoutCompletionGrantsTrial(
  status: BillingStatusResponse | undefined,
): boolean {
  if (!status) {
    return false;
  }
  if (status.subscriptionStatus === "awaiting_checkout") {
    return true;
  }
  if (
    status.subscriptionStatus === "trialing" &&
    status.needsPaymentMethod &&
    status.trialEndsAt
  ) {
    const remainingMs = new Date(status.trialEndsAt).getTime() - Date.now();
    return remainingMs >= STRIPE_MIN_TRIAL_REMAINING_MS;
  }
  return false;
}
