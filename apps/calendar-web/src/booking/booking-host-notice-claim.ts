export const BOOKING_HOST_NOTICE_CLAIM_FLOOR_MS = {
  focus: 5 * 60 * 1000,
  sse: 10 * 1000,
} as const;

export type BookingHostNoticeClaimTrigger =
  keyof typeof BOOKING_HOST_NOTICE_CLAIM_FLOOR_MS;

export type BookingHostNoticeClaimLimiter = {
  resetForTests: () => void;
  begin: (trigger: BookingHostNoticeClaimTrigger) => boolean;
  rollback: (trigger: BookingHostNoticeClaimTrigger) => void;
};

export function createBookingHostNoticeClaimLimiter(
  scope: string,
): BookingHostNoticeClaimLimiter {
  const lastClaimAtMs: Record<BookingHostNoticeClaimTrigger, number | null> = {
    focus: null,
    sse: null,
  };

  return {
    resetForTests: () => {
      lastClaimAtMs.focus = null;
      lastClaimAtMs.sse = null;
    },
    begin: (trigger) => {
      const now = Date.now();
      const lastAt = lastClaimAtMs[trigger];
      if (
        lastAt !== null &&
        now - lastAt < BOOKING_HOST_NOTICE_CLAIM_FLOOR_MS[trigger]
      ) {
        return false;
      }
      lastClaimAtMs[trigger] = now;
      void scope;
      return true;
    },
    rollback: (trigger) => {
      lastClaimAtMs[trigger] = null;
    },
  };
}
