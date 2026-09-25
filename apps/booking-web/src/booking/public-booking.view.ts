import { PublicBookingNotFoundError } from "@booking-web/api/public-booking.api";
import { type UseQueryResult } from "@tanstack/react-query";
import {
  type BookingSlotsResponse,
  type PublicGetBookingPageResponse,
  type PublicGetBookingReservationResponse,
} from "@core/types/booking.contracts";

/** Title and description handed straight to `PublicBookingStatusMessage`. */
export interface PublicBookingStatusCopy {
  title: string;
  description: string;
}

export const PUBLIC_BOOKING_UNBOOKABLE: PublicBookingStatusCopy = {
  title: "Meeting temporarily unavailable",
  description:
    "The host calendar is not ready for new meetings. Please try again later.",
};

/**
 * Copy shared verbatim by more than one guest page. Whatever names the link
 * the guest followed ("this cancel link", "this confirmation link") stays with
 * that page; everything below reads the same wherever it appears, so it is
 * spelled once.
 */
export const PUBLIC_BOOKING_LOAD_FAILED: PublicBookingStatusCopy = {
  title: "Could not load meeting",
  description: "Please refresh and try again.",
};

export const PUBLIC_BOOKING_CANCELLED: PublicBookingStatusCopy = {
  title: "This meeting was canceled",
  description:
    "The appointment is no longer on the host calendar. You can close this page.",
};

export const PUBLIC_BOOKING_RESERVATION_LOADING: PublicBookingStatusCopy = {
  title: "Loading meeting",
  description: "One moment while we load this meeting.",
};

const PUBLIC_BOOKING_PAGE_LOADING: PublicBookingStatusCopy = {
  title: "Loading meeting page",
  description: "One moment while we load available times.",
};

export const PUBLIC_BOOKING_SLOT_CONFLICT =
  "This time is no longer available. Pick another slot.";

/**
 * What a guest page should render once the reservation query has settled:
 * either a terminal status message, or the reservation itself.
 */
export type PublicBookingReservationView =
  | ({ kind: "status" } & PublicBookingStatusCopy)
  | { kind: "reservation"; reservation: PublicGetBookingReservationResponse };

/** The four terminal states every guest page has to spell out for itself. */
export interface PublicBookingReservationCopy {
  loading: PublicBookingStatusCopy;
  notFound: PublicBookingStatusCopy;
  loadFailed: PublicBookingStatusCopy;
  cancelled: PublicBookingStatusCopy;
  cancelling?: PublicBookingStatusCopy;
}

/**
 * Map a reservation query onto a view. The confirmed and cancel pages differ
 * only in the copy they show and in the checks they run *before* the query
 * matters, so the query-to-view mapping itself lives here once: a missing
 * reservation and a cancelled one must stay indistinguishable from a
 * not-found link across both pages.
 */
export const resolvePublicBookingReservationView = (
  reservationQuery: UseQueryResult<PublicGetBookingReservationResponse>,
  copy: PublicBookingReservationCopy,
): PublicBookingReservationView => {
  if (reservationQuery.isLoading) {
    return { kind: "status", ...copy.loading };
  }
  if (reservationQuery.isError) {
    return {
      kind: "status",
      ...(reservationQuery.error instanceof PublicBookingNotFoundError
        ? copy.notFound
        : copy.loadFailed),
    };
  }
  const reservation = reservationQuery.data;
  if (!reservation) {
    return { kind: "status", ...copy.notFound };
  }
  if (reservation.status === "cancelled") {
    return { kind: "status", ...copy.cancelled };
  }
  if (reservation.status === "cancelling") {
    return {
      kind: "status",
      ...(copy.cancelling ?? copy.cancelled),
    };
  }
  return { kind: "reservation", reservation };
};

/**
 * What a slot-picking page should render once the booking page query has
 * settled: a terminal status message, or the host's page.
 */
export type PublicBookingPageView =
  | ({ kind: "status" } & PublicBookingStatusCopy)
  | { kind: "page"; page: PublicGetBookingPageResponse };

/**
 * The gate both slot-picking pages run before they can draw a picker. A host
 * who turned the page off is indistinguishable from a bad link, and a calendar
 * that cannot take bookings ends the flow before the picker renders, so the
 * ladder lives here once and the pages differ only in `notFound`.
 */
export const resolvePublicBookingPageView = (
  pageQuery: UseQueryResult<PublicGetBookingPageResponse>,
  slotsData: BookingSlotsResponse | undefined,
  notFound: PublicBookingStatusCopy,
): PublicBookingPageView => {
  if (pageQuery.isLoading) {
    return { kind: "status", ...PUBLIC_BOOKING_PAGE_LOADING };
  }
  if (pageQuery.error instanceof PublicBookingNotFoundError) {
    return { kind: "status", ...notFound };
  }
  if (!pageQuery.isSuccess) {
    return { kind: "status", ...PUBLIC_BOOKING_LOAD_FAILED };
  }
  if (!pageQuery.data.enabled) {
    return { kind: "status", ...notFound };
  }
  if (slotsData && !slotsData.bookable) {
    return { kind: "status", ...PUBLIC_BOOKING_UNBOOKABLE };
  }
  return { kind: "page", page: pageQuery.data };
};
