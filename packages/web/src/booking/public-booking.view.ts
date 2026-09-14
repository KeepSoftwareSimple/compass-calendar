import { type UseQueryResult } from "@tanstack/react-query";
import { type PublicGetBookingReservationResponse } from "@core/types/booking.contracts";
import { PublicBookingNotFoundError } from "@web/api/public-booking.api";

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
