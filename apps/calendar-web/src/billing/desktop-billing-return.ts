import { buildDesktopBillingCheckoutDeepLink } from "@core/desktop/desktop-billing-return.util";

export function relayDesktopBillingReturn(
  outcome: string,
  sessionId: string,
): string {
  return buildDesktopBillingCheckoutDeepLink(outcome, sessionId);
}

export function openDesktopBillingReturn(relayUrl: string): void {
  window.location.assign(relayUrl);
}
