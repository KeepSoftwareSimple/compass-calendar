import { useCallback, useEffect } from "react";
import { useSession } from "@web/auth/compass/session/useSession";
import {
  type BookingHostNoticeClaimLimiter,
  type BookingHostNoticeClaimTrigger,
  createBookingHostNoticeClaimLimiter,
} from "@web/booking/booking-host-notice-claim";
import { IS_BOOKING_ENABLED } from "@web/common/constants/env.constants";
import { onServerMessage } from "@web/sse/client/sse.client";

const guestRsvpLimiter = createBookingHostNoticeClaimLimiter("guest-rsvp");
const newMeetingsLimiter = createBookingHostNoticeClaimLimiter("new-meetings");

export function resetGuestRsvpNoticeForTests(): void {
  guestRsvpLimiter.resetForTests();
}

export function resetNewMeetingsNoticeForTests(): void {
  newMeetingsLimiter.resetForTests();
}

function useBookingHostNoticeClaim(
  limiter: BookingHostNoticeClaimLimiter,
  claim: () => Promise<void>,
): void {
  const { authenticated } = useSession();

  const runClaim = useCallback(
    async (trigger: BookingHostNoticeClaimTrigger) => {
      if (!IS_BOOKING_ENABLED || !authenticated) {
        return;
      }
      if (!limiter.begin(trigger)) {
        return;
      }
      try {
        await claim();
      } catch {
        limiter.rollback(trigger);
      }
    },
    [authenticated, claim, limiter],
  );

  useEffect(() => {
    void runClaim("focus");
  }, [runClaim]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void runClaim("focus");
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [runClaim]);

  useEffect(() => {
    return onServerMessage("eventsChanged", () => {
      void runClaim("sse");
    });
  }, [runClaim]);
}

export function useBookingGuestRsvpNoticeClaim(
  claim: () => Promise<void>,
): void {
  useBookingHostNoticeClaim(guestRsvpLimiter, claim);
}

export function useBookingNewMeetingsNoticeClaim(
  claim: () => Promise<void>,
): void {
  useBookingHostNoticeClaim(newMeetingsLimiter, claim);
}
