const MEET_LINK =
  /href=["']([^"']*\/meet\/(cancel|reschedule)\/([^/?#]+)\?token=([^"'#&]+)[^"']*)["']/gi;

export type BookingEventLinks = {
  reservationId: string;
  token: string;
  cancelUrl: string;
  rescheduleUrl: string;
};

/**
 * Detects a Compass booking from the cancel/reschedule anchors the backend
 * writes into the event description HTML. Returns null when either anchor is
 * missing or the id/token pair does not match.
 */
export function parseBookingEventLinks(
  description: string | null | undefined,
): BookingEventLinks | null {
  if (!description?.trim()) return null;

  let cancelUrl: string | null = null;
  let rescheduleUrl: string | null = null;
  let reservationId: string | null = null;
  let token: string | null = null;

  for (const match of description.matchAll(MEET_LINK)) {
    const [, url, kind, id, linkToken] = match;
    if (!url || !id || !linkToken) continue;

    if (kind === "cancel") {
      cancelUrl = url;
    } else if (kind === "reschedule") {
      rescheduleUrl = url;
    }

    if (reservationId === null) {
      reservationId = id;
      token = linkToken;
      continue;
    }

    if (reservationId !== id || token !== linkToken) {
      return null;
    }
  }

  if (!cancelUrl || !rescheduleUrl || !reservationId || !token) {
    return null;
  }

  return { reservationId, token, cancelUrl, rescheduleUrl };
}
