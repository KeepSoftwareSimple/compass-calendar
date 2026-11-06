import { getErrorStatus } from "@booking-web/api/public-booking-http";
import { usePublicBookingOwnerInboxQuery } from "@booking-web/booking/public-booking.query";

/**
 * Whether the signed-in viewer owns this `/meet/:slug` page.
 *
 * `undefined` while auth is unresolved so callers render nothing until
 * ownership is known (no layout shift for guests or loading owners).
 */
export function usePublicBookingPageOwner(slug: string): boolean | undefined {
  const inboxQuery = usePublicBookingOwnerInboxQuery(slug);

  if (inboxQuery.isPending && !inboxQuery.data) {
    return undefined;
  }

  if (inboxQuery.isError) {
    const status = getErrorStatus(inboxQuery.error);
    if (status === 401 || status === 404) {
      return false;
    }
    return undefined;
  }

  return inboxQuery.data != null;
}
