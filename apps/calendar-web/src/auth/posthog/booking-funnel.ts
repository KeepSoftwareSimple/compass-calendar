import { getApiErrorCode, isApiError } from "@web/api/util/api.util";
import { track } from "@web/auth/posthog/track";
import { type SetupStepId } from "@web/booking/setup/setup-steps";

/**
 * The host setup funnel, as one enumerable vocabulary.
 *
 * The guest conversion half of this funnel moved to booking-web with the
 * guest UI (`@booking-web/telemetry/guest-booking-funnel`); calendar-web no
 * longer renders a /meet page, so nothing here may fire a guest event.
 *
 * Counting: a transition fires when its identity changes, not when React
 * re-renders or TanStack Query refetches the same result. Back into a setup
 * step is a new transition. Reload is a new session.
 */
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
