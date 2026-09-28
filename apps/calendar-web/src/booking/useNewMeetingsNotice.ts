import { useCallback, useEffect } from "react";
import { BookingApi } from "@web/api/booking.api";
import { useSession } from "@web/auth/compass/session/useSession";
import { showNewMeetingsToast } from "@web/booking/NewMeetingsToast";
import { IS_BOOKING_ENABLED } from "@web/common/constants/env.constants";
import { onServerMessage } from "@web/sse/client/sse.client";

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const TEN_SECONDS_MS = 10 * 1000;

let lastFocusClaimAtMs: number | null = null;
let lastSseClaimAtMs: number | null = null;

export function resetNewMeetingsNoticeForTests(): void {
  lastFocusClaimAtMs = null;
  lastSseClaimAtMs = null;
}

type ClaimTrigger = "focus" | "sse";

export function useNewMeetingsNotice(): void {
  const { authenticated } = useSession();

  const claim = useCallback(
    async (trigger: ClaimTrigger) => {
      if (!IS_BOOKING_ENABLED || !authenticated) {
        return;
      }
      const now = Date.now();
      const floorMs = trigger === "sse" ? TEN_SECONDS_MS : FIVE_MINUTES_MS;
      const lastAt = trigger === "sse" ? lastSseClaimAtMs : lastFocusClaimAtMs;
      if (lastAt !== null && now - lastAt < floorMs) {
        return;
      }
      if (trigger === "sse") {
        lastSseClaimAtMs = now;
      } else {
        lastFocusClaimAtMs = now;
      }
      try {
        const result = await BookingApi.claimNewMeetings();
        showNewMeetingsToast(result);
      } catch {
        // The watermark is only advanced after a successful read, so clear the
        // gate and let the next pass retry.
        if (trigger === "sse") {
          lastSseClaimAtMs = null;
        } else {
          lastFocusClaimAtMs = null;
        }
      }
    },
    [authenticated],
  );

  useEffect(() => {
    void claim("focus");
  }, [claim]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void claim("focus");
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [claim]);

  useEffect(() => {
    return onServerMessage("eventsChanged", () => {
      void claim("sse");
    });
  }, [claim]);
}
