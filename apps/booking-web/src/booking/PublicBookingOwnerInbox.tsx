import { getErrorStatus } from "@booking-web/api/public-booking-http";
import { PublicBookingOwnerInboxRow } from "@booking-web/booking/PublicBookingOwnerInboxRow";
import {
  useCancelPublicBookingOwnerReservationMutation,
  usePublicBookingOwnerInboxQuery,
} from "@booking-web/booking/public-booking.query";
import { useId } from "react";
import { IS_MEET_PAGE_OWNER_INBOX_ENABLED } from "@web/common/constants/env.constants";

interface PublicBookingOwnerInboxProps {
  slug: string;
  hostTimeZone: string;
}

export function PublicBookingOwnerInbox({
  slug,
  hostTimeZone,
}: PublicBookingOwnerInboxProps) {
  const inboxQuery = usePublicBookingOwnerInboxQuery(slug);
  const cancelMutation = useCancelPublicBookingOwnerReservationMutation(slug);
  const sectionHeadingId = useId();

  if (!IS_MEET_PAGE_OWNER_INBOX_ENABLED) {
    return null;
  }

  if (inboxQuery.isError) {
    const status = getErrorStatus(inboxQuery.error);
    if (status === 401 || status === 404) {
      return null;
    }
  }

  if (inboxQuery.isPending && !inboxQuery.data) {
    return null;
  }

  if (!inboxQuery.data) {
    return null;
  }

  const bookings = inboxQuery.data.reservations;

  return (
    <section aria-labelledby={sectionHeadingId} className="flex flex-col gap-3">
      <h2 className="font-medium text-base text-text" id={sectionHeadingId}>
        Your upcoming bookings
      </h2>
      {bookings.length === 0 ? (
        <p className="text-sm text-text-muted">
          No upcoming bookings through this page yet.
        </p>
      ) : (
        <ul className="flex list-none flex-col gap-3 p-0">
          {bookings.map((booking) => (
            <PublicBookingOwnerInboxRow
              booking={booking}
              cancelPending={cancelMutation.isPending}
              hostTimeZone={hostTimeZone}
              key={booking.reservationId}
              onCancel={(reservationId) => {
                cancelMutation.mutate(reservationId);
              }}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
