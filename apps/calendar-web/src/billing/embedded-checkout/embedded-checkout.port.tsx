import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { useMemo } from "react";
import { showBillingRequestError } from "@web/billing/billing-request-error";
import { type EmbeddedCheckoutProps } from "./embedded-checkout.seam";

const CHECKOUT_REQUEST_FALLBACK = "Couldn't start checkout. Please try again.";

const stripePromises = new Map<string, ReturnType<typeof loadStripe>>();

/** Memoised per key. Call on first mount of a checkout surface, never at boot. */
export function getStripePromise(publishableKey: string) {
  const existing = stripePromises.get(publishableKey);
  if (existing) return existing;
  const promise = loadStripe(publishableKey);
  stripePromises.set(publishableKey, promise);
  return promise;
}

export function resetStripePromiseForTests(): void {
  stripePromises.clear();
}

export function fetchEmbeddedCheckoutClientSecret(
  fetchClientSecret: () => Promise<string>,
): Promise<string> {
  return fetchClientSecret().catch((error: unknown) => {
    showBillingRequestError(error, CHECKOUT_REQUEST_FALLBACK);
    throw error;
  });
}

export function StripeEmbeddedCheckout({
  publishableKey,
  fetchClientSecret,
  onComplete,
  className,
}: EmbeddedCheckoutProps) {
  const stripe = getStripePromise(publishableKey);
  const options = useMemo(
    () => ({
      fetchClientSecret: () =>
        fetchEmbeddedCheckoutClientSecret(fetchClientSecret),
      onComplete,
    }),
    [fetchClientSecret, onComplete],
  );

  return (
    <EmbeddedCheckoutProvider stripe={stripe} options={options}>
      <EmbeddedCheckout className={className} />
    </EmbeddedCheckoutProvider>
  );
}

export default StripeEmbeddedCheckout;
