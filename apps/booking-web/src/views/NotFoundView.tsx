import { PublicBookingLayout } from "@booking-web/booking/PublicBookingLayout";
import { PublicBookingStatusMessage } from "@booking-web/booking/PublicBookingStatusMessage";

export function NotFoundView() {
  return (
    <PublicBookingLayout>
      <PublicBookingStatusMessage
        title="Page not found"
        description="This link does not match a meeting page."
      />
    </PublicBookingLayout>
  );
}
