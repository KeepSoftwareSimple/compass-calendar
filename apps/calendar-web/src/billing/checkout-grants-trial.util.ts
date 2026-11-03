import { type BillingStatusResponse } from "@core/types/billing.types";

/** True when embedded Checkout will create a Stripe trial (mirrors server checkout trial fields). */
export function checkoutCompletionGrantsTrial(
  status: BillingStatusResponse | undefined,
): boolean {
  return status?.subscriptionStatus === "awaiting_checkout";
}
