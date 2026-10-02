/** Stripe replaces this token in success and cancel URLs after Checkout. */
export const STRIPE_CHECKOUT_SESSION_ID_PLACEHOLDER = "{CHECKOUT_SESSION_ID}";

const DESKTOP_BILLING_RETURN_PATH = "/billing/desktop-return";

export type DesktopBillingReturnOutcome = "success" | "cancel";

export function buildDesktopBillingReturnUrl(
  frontendUrl: string,
  outcome: DesktopBillingReturnOutcome,
): string {
  const base = frontendUrl.replace(/\/$/, "");
  // Stripe requires the literal `{CHECKOUT_SESSION_ID}` token, not URL-encoded.
  return `${base}${DESKTOP_BILLING_RETURN_PATH}?outcome=${outcome}&session_id=${STRIPE_CHECKOUT_SESSION_ID_PLACEHOLDER}`;
}

export function buildDesktopBillingCheckoutDeepLink(
  outcome: string,
  sessionId: string,
): string {
  const params = new URLSearchParams({
    outcome,
    session_id: sessionId,
  });
  return `compass://billing/checkout?${params.toString()}`;
}
