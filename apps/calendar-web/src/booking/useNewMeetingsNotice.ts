import { useCallback, useEffect } from "react";
import { BookingApi } from "@web/api/booking.api";
import { useSession } from "@web/auth/compass/session/useSession";
import { showNewMeetingsToast } from "@web/booking/NewMeetingsToast";
import { IS_BOOKING_ENABLED } from "@web/common/constants/env.constants";
import { onServerMessage } from "@web/sse/client/sse.client";

const CLAIM_FLOOR_MS = {
  focus: 5 * 60 * 1000,
  sse: 10 * 1000,
} as const;

const lastClaimAtMs: Record<keyof typeof CLAIM_FLOOR_MS, number | null> = {
  focus: null,
  sse: null,
};

export function resetNewMeetingsNoticeForTests(): void {
  lastClaimAtMs.focus = null;
  lastClaimAtMs.sse = null;
}

type ClaimTrigger = keyof typeof CLAIM_FLOOR_MS;

export function useNewMeetingsNotice(): void {
  const { authenticated } = useSession();

  const claim = useCallback(
    async (trigger: ClaimTrigger) => {
      if (!IS_BOOKING_ENABLED || !authenticated) {
        return;
      }
      const now = Date.now();
      const lastAt = lastClaimAtMs[trigger];
      if (lastAt !== null && now - lastAt < CLAIM_FLOOR_MS[trigger]) {
        return;
      }
      lastClaimAtMs[trigger] = now;
      try {
        const result = await BookingApi.claimNewMeetings();
        showNewMeetingsToast(result);
      } catch {
        // The watermark is only advanced after a successful read, so clear the
        // gate and let the next pass retry.
        lastClaimAtMs[trigger] = null;
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
