import type Stripe from "stripe";
import { syntheticAccountPosthogFlags } from "@core/analytics/synthetic-account.util";

/**
 * Checkout Session metadata key set only on synthetic journey sessions. The
 * journey cleanup deletes the Compass user before Stripe expires the session,
 * so `checkout.session.expired` cannot look the user up to tag the event.
 */
export const CHECKOUT_SESSION_SYNTHETIC_METADATA_KEY = "compassSynthetic";

export function syntheticCheckoutSessionMetadata(): Record<string, string> {
  return { [CHECKOUT_SESSION_SYNTHETIC_METADATA_KEY]: "true" };
}

export function checkoutSessionPosthogSyntheticFlags(
  session: Pick<Stripe.Checkout.Session, "metadata">,
): Record<string, boolean> {
  return session.metadata?.[CHECKOUT_SESSION_SYNTHETIC_METADATA_KEY] === "true"
    ? syntheticAccountPosthogFlags()
    : {};
}
