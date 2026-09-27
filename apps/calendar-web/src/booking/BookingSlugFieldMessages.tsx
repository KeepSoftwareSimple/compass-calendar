import { BOOKING_ADDRESS_CHANGE_WARNING } from "@web/booking/booking-address.util";
import { type BookingSlugFieldState } from "@web/booking/useBookingSlugField";

/** The parse error and the address-change warning under a slug input. */
export function BookingSlugFieldMessages({
  field,
}: {
  field: BookingSlugFieldState;
}) {
  return (
    <>
      {field.showError ? (
        <p
          className="font-medium text-sm text-text"
          id={field.errorId}
          role="alert"
        >
          {field.parseMessage}
        </p>
      ) : null}
      {field.showWarning ? (
        <p
          className="font-medium text-sm text-text"
          id={field.warningId}
          role="status"
        >
          {BOOKING_ADDRESS_CHANGE_WARNING}
        </p>
      ) : null}
    </>
  );
}
