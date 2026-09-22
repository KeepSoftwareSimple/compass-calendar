import { getErrorStatus } from "@booking-web/api/public-booking-http";
import { Status } from "@core/errors/status.codes";
import { track } from "@web/auth/posthog/track";

type BookingSlotsOutcome = "available" | "empty" | "error" | "unbookable";
type BookingSubmitFailureReason =
  | "conflict"
  | "rate_limited"
  | "transport"
  | "unavailable"
  | "validation";

export function trackBookingSlotsLoaded(
  outcome: BookingSlotsOutcome,
  properties: { duration_minutes: number },
): void {
  track("booking_slots_loaded", {
    outcome,
    duration_minutes: properties.duration_minutes,
  });
}

export function trackBookingSlotSelected(properties: {
  duration_minutes: number;
  timezone_differs: boolean;
}): void {
  track("booking_slot_selected", properties);
}

export function trackBookingDetailsReached(properties: {
  duration_minutes: number;
  timezone_differs: boolean;
}): void {
  track("booking_details_reached", properties);
}

export function trackBookingSubmitAttempted(properties: {
  duration_minutes: number;
}): void {
  track("booking_submit_attempted", properties);
}

export function trackBookingSubmitFailed(
  reason: BookingSubmitFailureReason,
  properties: { duration_minutes: number },
): void {
  track("booking_submit_failed", {
    reason,
    duration_minutes: properties.duration_minutes,
  });
}

export function bookingSlotsOutcome(input: {
  bookable?: boolean;
  slotCount: number;
  isError: boolean;
}): BookingSlotsOutcome | null {
  if (input.isError) return "error";
  if (input.bookable === false) return "unbookable";
  if (input.bookable !== true) return null;
  return input.slotCount > 0 ? "available" : "empty";
}

export function bookingSubmitFailureReason(
  error: unknown,
): BookingSubmitFailureReason {
  const status = getErrorStatus(error);
  if (status === Status.CONFLICT) return "conflict";
  if (status === Status.NOT_FOUND) return "unavailable";
  if (
    status === Status.TOO_MANY_REQUESTS ||
    status === Status.SERVICE_UNAVAILABLE
  ) {
    return "rate_limited";
  }
  return "transport";
}
