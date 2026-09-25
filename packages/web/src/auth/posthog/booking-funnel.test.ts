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
  trackBookingSetupSaveFailed,
  trackBookingSetupSaveSucceeded,
  trackBookingSetupStepCompleted,
  trackBookingSetupStepViewed,
} = await import("@web/auth/posthog/booking-funnel");

describe("booking setup funnel", () => {
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

  it("maps save failures onto low-cardinality reasons", () => {
    expect(
      bookingSetupSaveFailureReason(
        apiError(Status.CONFLICT, { code: "SLUG_TAKEN" }),
      ),
    ).toBe("slug_taken");
    expect(bookingSetupSaveFailureReason(new Error("offline"))).toBe(
      "transport",
    );
  });
});
