import { PublicBookingStatusMessage } from "@booking-web/booking/PublicBookingStatusMessage";
import { MeetLandingLink } from "@booking-web/landing/MeetLandingLink";

/**
 * The status message already renders PublicBookingLayout; wrapping it again
 * nested two scrollers, two mains, and two footers.
 */
export function NotFoundView() {
  return (
    <PublicBookingStatusMessage
      title="Page not found"
      description="This link does not match a meeting page."
    >
      <MeetLandingLink />
    </PublicBookingStatusMessage>
  );
}
