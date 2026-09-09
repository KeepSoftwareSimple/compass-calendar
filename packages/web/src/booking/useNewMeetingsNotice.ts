import { useCallback, useEffect } from "react";
import { BookingApi } from "@web/api/booking.api";
import { useSession } from "@web/auth/compass/session/useSession";
import { showNewMeetingsToast } from "@web/booking/NewMeetingsToast";
import { IS_BOOKING_ENABLED } from "@web/common/constants/env.constants";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

let lastClaimAtMs: number | null = null;

export function resetNewMeetingsNoticeForTests(): void {
  lastClaimAtMs = null;
}

export function useNewMeetingsNotice(): void {
  const { authenticated } = useSession();

  const claim = useCallback(async () => {
    if (!IS_BOOKING_ENABLED || !authenticated) {
      return;
    }
    const now = Date.now();
    if (lastClaimAtMs !== null && now - lastClaimAtMs < FIVE_MINUTES_MS) {
      return;
    }
    lastClaimAtMs = now;
    try {
      const result = await BookingApi.claimNewMeetings();
      showNewMeetingsToast(result.reservations);
    } catch {
      // The stamp already happened or the request failed. Either way the
      // five-minute gate still applies so a flapping tab cannot hammer POST.
    }
  }, [authenticated]);

  useEffect(() => {
    void claim();
  }, [claim]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void claim();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [claim]);
}
