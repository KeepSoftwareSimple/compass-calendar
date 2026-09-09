import { type BookingNewMeetingsClaimReservation } from "@core/types/booking.contracts";
import { useCheckoutCelebrationStore } from "@web/billing/checkout-celebration.store";

/**
 * The billing gate is the only thing on screen until the user starts a trial
 * or looks around. Reconnect / delayed-sync toasts wait so they cannot compete
 * with Start trial.
 */

let ownsScreen = false;
let pendingReconnect: {
  connectionId?: string | null;
  accountEmail?: string | null;
} | null = null;
let pendingDelayed = false;
let pendingNewMeetings: readonly BookingNewMeetingsClaimReservation[] | null =
  null;

export function setBillingGateOwnsScreen(owns: boolean): void {
  ownsScreen = owns;
}

export function isBillingGateOwningScreen(): boolean {
  return ownsScreen;
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
  reservations: readonly BookingNewMeetingsClaimReservation[],
): void {
  pendingNewMeetings = reservations;
}

export function takePendingNewMeetings():
  | readonly BookingNewMeetingsClaimReservation[]
  | null {
  const next = pendingNewMeetings;
  pendingNewMeetings = null;
  return next;
}

export function resetBillingGateAttentionForTests(): void {
  ownsScreen = false;
  pendingReconnect = null;
  pendingDelayed = false;
  pendingNewMeetings = null;
}
