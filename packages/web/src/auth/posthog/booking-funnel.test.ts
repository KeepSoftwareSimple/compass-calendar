import { Status } from "@core/errors/status.codes";
import { type ApiError, type ApiResponse } from "@web/api/api.types";
import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const apiError = (status: number, data: unknown): ApiError => {
  const config = { url: "/api/booking/page" };
  const response = {
    config,
    data,
    headers: new Headers(),
    status,
    statusText: "",
  } as ApiResponse<unknown>;
  const error = new Error(`Request failed with status ${status}`) as ApiError;
  error.name = "ApiError";
  error.config = config;
  error.response = response;
  return error;
};

const capture = mock();

const actualPosthogBootstrap = {
  ...(await import("@web/auth/posthog/posthog.bootstrap")),
};
let isClientMocked = true;

mock.module("@web/auth/posthog/posthog.bootstrap", () => ({
  ...actualPosthogBootstrap,
  getPosthogClient: () =>
    isClientMocked ? { capture } : actualPosthogBootstrap.getPosthogClient(),
}));

afterAll(() => {
  isClientMocked = false;
});

const {
  bookingSetupSaveFailureReason,
  bookingSlotsOutcome,
  bookingSubmitFailureReason,
  trackBookingDetailsReached,
  trackBookingSetupSaveFailed,
  trackBookingSetupSaveSucceeded,
  trackBookingSetupStepCompleted,
  trackBookingSetupStepViewed,
  trackBookingSlotSelected,
  trackBookingSlotsLoaded,
  trackBookingSubmitAttempted,
  trackBookingSubmitFailed,
} = await import("@web/auth/posthog/booking-funnel");

describe("booking funnel", () => {
  beforeEach(() => {
    capture.mockClear();
  });

  it("shapes host setup steps with configured_host", () => {
    trackBookingSetupStepViewed("address", { configured_host: false });
    trackBookingSetupStepCompleted("address");

    expect(capture).toHaveBeenNthCalledWith(1, "booking_setup_step_viewed", {
      step: "address",
      configured_host: false,
    });
    expect(capture).toHaveBeenNthCalledWith(2, "booking_setup_step_completed", {
      step: "address",
    });
  });

  it("shapes setup save outcomes with a reason enum", () => {
    trackBookingSetupSaveSucceeded("address");
    trackBookingSetupSaveFailed("slug_taken", { step: "address" });

    expect(capture).toHaveBeenNthCalledWith(1, "booking_setup_save_succeeded", {
      step: "address",
    });
    expect(capture).toHaveBeenNthCalledWith(2, "booking_setup_save_failed", {
      step: "address",
      reason: "slug_taken",
    });
  });

  it("shapes guest slot-load, selection, details, and submit", () => {
    trackBookingSlotsLoaded("available", { duration_minutes: 30 });
    trackBookingSlotSelected({
      duration_minutes: 30,
      timezone_differs: true,
    });
    trackBookingDetailsReached({
      duration_minutes: 30,
      timezone_differs: true,
    });
    trackBookingSubmitAttempted({ duration_minutes: 30 });
    trackBookingSubmitFailed("conflict", { duration_minutes: 30 });

    expect(capture).toHaveBeenCalledWith("booking_slots_loaded", {
      outcome: "available",
      duration_minutes: 30,
    });
    expect(capture).toHaveBeenCalledWith("booking_slot_selected", {
      duration_minutes: 30,
      timezone_differs: true,
    });
    expect(capture).toHaveBeenCalledWith("booking_details_reached", {
      duration_minutes: 30,
      timezone_differs: true,
    });
    expect(capture).toHaveBeenCalledWith("booking_submit_attempted", {
      duration_minutes: 30,
    });
    expect(capture).toHaveBeenCalledWith("booking_submit_failed", {
      reason: "conflict",
      duration_minutes: 30,
    });
  });

  it("maps slot-load outcomes without inventing a result while pending", () => {
    expect(
      bookingSlotsOutcome({ bookable: true, slotCount: 2, isError: false }),
    ).toBe("available");
    expect(
      bookingSlotsOutcome({ bookable: true, slotCount: 0, isError: false }),
    ).toBe("empty");
    expect(
      bookingSlotsOutcome({ bookable: false, slotCount: 0, isError: false }),
    ).toBe("unbookable");
    expect(
      bookingSlotsOutcome({ bookable: true, slotCount: 0, isError: true }),
    ).toBe("error");
    expect(bookingSlotsOutcome({ slotCount: 0, isError: false })).toBeNull();
  });

  it("maps save and submit failures onto low-cardinality reasons", () => {
    expect(
      bookingSetupSaveFailureReason(
        apiError(Status.CONFLICT, { code: "SLUG_TAKEN" }),
      ),
    ).toBe("slug_taken");
    expect(bookingSetupSaveFailureReason(new Error("offline"))).toBe(
      "transport",
    );

    expect(bookingSubmitFailureReason(apiError(Status.CONFLICT, {}))).toBe(
      "conflict",
    );
    expect(bookingSubmitFailureReason(apiError(Status.NOT_FOUND, {}))).toBe(
      "unavailable",
    );
    expect(
      bookingSubmitFailureReason(apiError(Status.TOO_MANY_REQUESTS, {})),
    ).toBe("rate_limited");
    expect(bookingSubmitFailureReason(new Error("network"))).toBe("transport");
  });
});
