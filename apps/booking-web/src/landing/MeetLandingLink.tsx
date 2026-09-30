import { PUBLIC_BOOKING_TEXT_LINK_CLASS } from "@booking-web/booking/PublicBookingLayout";
import { ROOT_ROUTES } from "@booking-web/common/constants/routes";

/**
 * Not-found pages point at the landing page so a bad or stale link still
 * explains what meeting pages are. A full navigation is fine here.
 */
export function MeetLandingLink() {
  return (
    <p className="mt-4">
      <a className={PUBLIC_BOOKING_TEXT_LINK_CLASS} href={ROOT_ROUTES.LANDING}>
        See how meeting pages work
      </a>
    </p>
  );
}
