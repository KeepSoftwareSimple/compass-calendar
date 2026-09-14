import { Status } from "@core/errors/status.codes";
import {
  getApiErrorCode,
  getErrorStatus,
  isApiError,
} from "@web/api/util/api.util";
import { track } from "@web/auth/posthog/track";
import { type SetupStepId } from "@web/booking/setup/setup-steps";

/**
 * Host setup and guest conversion funnels, as one enumerable vocabulary.
 *
 * The five shipped booking events keep their names and properties.
 * These helpers only add the missing transitions. `booking_reservation_created`
 * stays the browser-observed confirmation; WP-11 owns authoritative server
 * completion.
 *
 * Counting: a transition fires when its identity changes, not when React
 * re-renders or TanStack Query refetches the same result. Back into a setup
 * step or picking a different slot is a new transition. Reload is a new
 * session. Confirm clicks always count; retries after conflict or transport
 * failure are additional attempts.
 */
export type BookingSlotsOutcome =
  | "available"
  | "empty"
  | "unbookable"
  | "error";

export type BookingSubmitFailureReason =
  | "validation"
  | "conflict"
  | "unavailable"
  | "rate_limited"
  | "transport";

export type BookingSetupSaveFailureReason =
  | "validation"
  | "slug_taken"
  | "destination_not_writable"
  | "blocking_calendar_invalid"
  | "availability_required"
  | "timezone_required"
  | "billing_required"
  | "invalid_input"
  | "transport";

export type BookingSetupSaveStep = Extract<SetupStepId, "address" | "live">;

type OptionalProperties = Record<string, boolean | number | string | undefined>;

export function trackBookingSetupStepViewed(
  step: SetupStepId,
  properties: { configured_host: boolean },
): void {
  track("booking_setup_step_viewed", {
    step,
    configured_host: properties.configured_host,
  });
}

export function trackBookingSetupStepCompleted(step: SetupStepId): void {
  track("booking_setup_step_completed", { step });
}

export function trackBookingSetupSaveSucceeded(
  step: BookingSetupSaveStep,
): void {
  track("booking_setup_save_succeeded", { step });
}

export function trackBookingSetupSaveFailed(
  reason: BookingSetupSaveFailureReason,
  properties: { step: BookingSetupSaveStep },
): void {
  track("booking_setup_save_failed", {
    step: properties.step,
    reason,
  });
}

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
  track("booking_slot_selected", compact(properties));
}

export function trackBookingDetailsReached(properties: {
  duration_minutes: number;
  timezone_differs: boolean;
}): void {
  track("booking_details_reached", compact(properties));
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

export function bookingSetupSaveFailureReason(
  error: unknown,
): BookingSetupSaveFailureReason {
  if (!isApiError(error)) return "transport";
  const code = getApiErrorCode(error);
  switch (code) {
    case "SLUG_TAKEN":
      return "slug_taken";
    case "DESTINATION_NOT_WRITABLE":
      return "destination_not_writable";
    case "BLOCKING_CALENDAR_INVALID":
      return "blocking_calendar_invalid";
    case "AVAILABILITY_REQUIRED":
      return "availability_required";
    case "TIMEZONE_REQUIRED":
      return "timezone_required";
    case "BILLING_REQUIRED":
      return "billing_required";
    case "INVALID_INPUT":
      return "invalid_input";
    default:
      return "transport";
  }
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

function compact(properties: OptionalProperties) {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined),
  );
}
