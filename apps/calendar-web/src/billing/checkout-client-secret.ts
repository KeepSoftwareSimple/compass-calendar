import { type BillingCheckoutResponse } from "@core/types/billing.types";

/**
 * Stripe subscription and card update checkouts return an embedded Checkout
 * client secret. A missing secret means the server did not return one.
 */
export function requireCheckoutClientSecret(
  response: BillingCheckoutResponse,
): string {
  if (!response.clientSecret) {
    throw new Error("Checkout did not return a client secret");
  }
  return response.clientSecret;
}

/** Stable callback for Stripe embedded Checkout `fetchClientSecret`. */
export function fetchEmbeddedCheckoutSecret(
  createSession: () => Promise<BillingCheckoutResponse>,
): () => Promise<string> {
  return () => createSession().then(requireCheckoutClientSecret);
}
