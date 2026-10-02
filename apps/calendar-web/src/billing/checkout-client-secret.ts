import { type BillingCheckoutResponse } from "@core/types/billing.types";

/**
 * A checkout response carries either a client secret (embedded form) or a
 * hosted Checkout URL (desktop return). The embedded panels never ask for the
 * desktop shape, so a missing secret means the server answered the wrong one.
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
