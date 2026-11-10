import { useCallback } from "react";
import { BookingApi } from "@web/api/booking.api";
import { showGuestRsvpToastFromClaim } from "@web/booking/GuestRsvpToast";
import { useBookingGuestRsvpNoticeClaim } from "@web/booking/useBookingHostNoticeClaim";

export { resetGuestRsvpNoticeForTests } from "@web/booking/useBookingHostNoticeClaim";

export function useGuestRsvpNotice(): void {
  const claim = useCallback(async () => {
    const result = await BookingApi.claimGuestRsvpReplies();
    showGuestRsvpToastFromClaim(result);
  }, []);

  useBookingGuestRsvpNoticeClaim(claim);
}
