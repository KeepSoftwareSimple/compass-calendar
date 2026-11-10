import { useCallback } from "react";
import { BookingApi } from "@web/api/booking.api";
import { showNewMeetingsToast } from "@web/booking/NewMeetingsToast";
import { useBookingNewMeetingsNoticeClaim } from "@web/booking/useBookingHostNoticeClaim";

export { resetNewMeetingsNoticeForTests } from "@web/booking/useBookingHostNoticeClaim";

export function useNewMeetingsNotice(): void {
  const claim = useCallback(async () => {
    const result = await BookingApi.claimNewMeetings();
    showNewMeetingsToast(result);
  }, []);

  useBookingNewMeetingsNoticeClaim(claim);
}
