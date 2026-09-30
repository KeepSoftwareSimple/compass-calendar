import { type BookingNewMeetingsClaimResponse } from "@core/types/booking.contracts";
import { useCheckoutCelebrationStore } from "@web/billing/checkout-celebration.store";
import { type GuestRsvpToastPayload } from "@web/booking/GuestRsvpToast";

/**
 * The billing gate is the only thing on screen until the user starts a trial.
 * Reconnect, delayed-sync, and booking toasts wait so they cannot compete with
 * Start trial.
 */

let ownsScreen = false;
let pendingReconnect: {
  connectionId?: string | null;
  accountEmail?: string | null;
} | null = null;
let pendingDelayed = false;
let pendingNewMeetings: BookingNewMeetingsClaimResponse | null = null;
let pendingGuestRsvp: GuestRsvpToastPayload | null = null;

export function setBillingGateOwnsScreen(owns: boolean): void {
  const wasOwning = ownsScreen;
  ownsScreen = owns;
  if (wasOwning && !owns) {
    flushDeferredAttentionToasts();
  }
}

function flushDeferredAttentionToasts(): void {
  void import("@web/common/utils/toast/google-reconnect.toast").then(
    ({ flushDeferredGoogleReconnectToast }) => {
      flushDeferredGoogleReconnectToast();
    },
  );
  void import("@web/common/utils/toast/google-delayed.toast").then(
    ({ flushDeferredGoogleDelayedToast }) => {
      flushDeferredGoogleDelayedToast();
    },
  );
  void import("@web/booking/NewMeetingsToast").then(
    ({ flushDeferredNewMeetingsToast }) => {
      flushDeferredNewMeetingsToast();
    },
  );
  void import("@web/booking/GuestRsvpToast").then(
    ({ flushDeferredGuestRsvpToast }) => {
      flushDeferredGuestRsvpToast();
    },
  );
}

export function shouldDeferAttentionToasts(): boolean {
  return ownsScreen || useCheckoutCelebrationStore.getState().isCelebrating;
}

export function rememberPendingReconnect(target: {
  connectionId?: string | null;
  accountEmail?: string | null;
}): void {
  pendingReconnect = target;
}

export function takePendingReconnect(): {
  connectionId?: string | null;
  accountEmail?: string | null;
} | null {
  const next = pendingReconnect;
  pendingReconnect = null;
  return next;
}

export function rememberPendingDelayed(): void {
  pendingDelayed = true;
}

export function takePendingDelayed(): boolean {
  const next = pendingDelayed;
  pendingDelayed = false;
  return next;
}

export function rememberPendingNewMeetings(
  claim: BookingNewMeetingsClaimResponse,
): void {
  pendingNewMeetings = claim;
}

export function takePendingNewMeetings(): BookingNewMeetingsClaimResponse | null {
  const next = pendingNewMeetings;
  pendingNewMeetings = null;
  return next;
}

export function rememberPendingGuestRsvp(payload: GuestRsvpToastPayload): void {
  pendingGuestRsvp = payload;
}

export function takePendingGuestRsvp(): GuestRsvpToastPayload | null {
  const next = pendingGuestRsvp;
  pendingGuestRsvp = null;
  return next;
}

export function resetBillingGateAttentionForTests(): void {
  ownsScreen = false;
  pendingReconnect = null;
  pendingDelayed = false;
  pendingNewMeetings = null;
  pendingGuestRsvp = null;
}
