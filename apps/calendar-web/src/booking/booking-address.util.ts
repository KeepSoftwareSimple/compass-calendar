export const BOOKING_ADDRESS_CHANGE_WARNING =
  "Links using your old address will stop working.";

/** The `https://origin/meet/` prefix every meeting address is built on. */
export function bookingAddressPrefix(bookingUrl: string | null): string {
  const origin = bookingUrl
    ? new URL(bookingUrl).origin
    : window.location.origin;
  return `${origin}/meet/`;
}
