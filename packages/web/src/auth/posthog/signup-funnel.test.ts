import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const capture = mock();

// bun's mock.module is global and leaks into every other file in the run.
// Spread the real module so unrelated suites still see its full surface, and
// only override getPosthogClient while this file runs.
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
  trackSignupCompleted,
  trackSignupFailed,
  trackSignupStarted,
  trackSignupStep,
} = await import("@web/auth/posthog/signup-funnel");

describe("signup funnel", () => {
  beforeEach(() => {
    capture.mockClear();
  });

  it("shapes a step as signup_step_viewed with step_name", () => {
    trackSignupStep("oauth_callback_returned", { method: "google" });

    expect(capture).toHaveBeenCalledWith("signup_step_viewed", {
      step_name: "oauth_callback_returned",
      method: "google",
    });
  });

  it("omits properties that were not provided", () => {
    trackSignupStep("welcome_viewed");

    expect(capture).toHaveBeenCalledWith("signup_step_viewed", {
      step_name: "welcome_viewed",
    });
  });

  it("shapes a failure as signup_failed with reason_code", () => {
    trackSignupFailed("oauth_user_cancelled", {
      method: "google",
      step: "oauth_callback_returned",
    });

    expect(capture).toHaveBeenCalledWith("signup_failed", {
      reason_code: "oauth_user_cancelled",
      method: "google",
      step: "oauth_callback_returned",
    });
  });

  // The legacy events feed existing PostHog insights. Their names and
  // properties must stay byte-identical while the new steps ride alongside.
  it("keeps signup_started unchanged and adds its step", () => {
    trackSignupStarted("welcome_modal_google");

    expect(capture).toHaveBeenNthCalledWith(1, "signup_started", {
      source: "welcome_modal_google",
    });
    expect(capture).toHaveBeenNthCalledWith(2, "signup_step_viewed", {
      step_name: "signup_cta_clicked",
      source: "welcome_modal_google",
    });
  });

  it("keeps signup_completed unchanged and adds its step", () => {
    trackSignupCompleted("email");

    expect(capture).toHaveBeenNthCalledWith(1, "signup_completed", {
      method: "email",
    });
    expect(capture).toHaveBeenNthCalledWith(2, "signup_step_viewed", {
      step_name: "account_created",
      method: "email",
    });
  });
});
