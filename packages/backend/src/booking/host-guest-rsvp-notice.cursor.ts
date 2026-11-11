import { type HostGuestRsvpNoticeStateRecord } from "@backend/booking/host-guest-rsvp-notice.record";

/** Unclaimed scan floor when the host has never stamped a notice cursor. */
export const HOST_GUEST_RSVP_NOTICE_EPOCH_MS = 0;

export const hostGuestRsvpSummarizeCursor = (
  state: HostGuestRsvpNoticeStateRecord,
): {
  firstObservedAt: string;
  observationId?: string;
} => {
  if (state.noticedAt) {
    return {
      firstObservedAt: state.noticedAt.toISOString(),
      ...(state.noticedObservationId
        ? { observationId: state.noticedObservationId.toString() }
        : {}),
    };
  }
  return {
    firstObservedAt: new Date(HOST_GUEST_RSVP_NOTICE_EPOCH_MS).toISOString(),
  };
};
