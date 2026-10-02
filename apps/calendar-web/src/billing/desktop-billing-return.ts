/**
 * Isolated so the return view can be tested without a real `window.location`.
 * The deep link itself is built in core by `buildDesktopBillingCheckoutDeepLink`.
 */
export function openDesktopBillingReturn(relayUrl: string): void {
  window.location.assign(relayUrl);
}
