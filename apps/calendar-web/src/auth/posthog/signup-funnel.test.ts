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
  trackCheckoutBack,
  trackCheckoutOpened,
  trackLocalModeSelected,
  trackSignupCompleted,
  trackSignupFailed,
  trackSignupStarted,
  trackSignupStep,
  trackTrialStepAbandoned,
  trackTrialStepCompleted,
  trackTrialStepViewed,
} = await import("@web/auth/posthog/signup-funnel");

describe("signup funnel", () => {
  beforeEach(() => {
    capture.mockClear();
  });

  it("shapes a step as signup_step_viewed with step_name", () => {
    trackSignupStep("oauth_callback_returned", { method: "google" });

    expect(capture).toHaveBeenCalledWith("signup_step_viewed", {
      step_name: "oauth_callback_returned",
      step: "oauth_callback_returned",
      method: "google",
    });
  });

  it("omits properties that were not provided", () => {
    trackSignupStep("welcome_viewed");

    expect(capture).toHaveBeenCalledWith("signup_step_viewed", {
      step_name: "welcome_viewed",
      step: "welcome_viewed",
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

  // The whole point of adding this field: reason_code alone can't say what
  // Google (or the exchange) actually returned, only that something failed.
  it("carries the underlying error on signup_failed", () => {
    trackSignupFailed("oauth_exchange_failed", {
      method: "google",
      step: "oauth_callback_returned",
      error: "invalid_grant",
    });

    expect(capture).toHaveBeenCalledWith("signup_failed", {
      reason_code: "oauth_exchange_failed",
      method: "google",
      step: "oauth_callback_returned",
      error: "invalid_grant",
    });
  });

  // The legacy events feed existing PostHog insights. Their names and
  // properties must stay byte-identical while the new steps ride alongside.
  it("fires local_mode_selected without signup funnel steps", () => {
    trackLocalModeSelected("anon_nudge");

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith("local_mode_selected", {
      source: "anon_nudge",
    });
  });

  it("keeps signup_started unchanged and adds its step", () => {
    trackSignupStarted("welcome_modal_google", 3);

    expect(capture).toHaveBeenNthCalledWith(1, "signup_started", {
      source: "welcome_modal_google",
      anon_events_created: 3,
    });
    expect(capture).toHaveBeenNthCalledWith(2, "signup_step_viewed", {
      step_name: "signup_cta_clicked",
      step: "signup_cta_clicked",
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
      step: "account_created",
      method: "email",
    });
  });

  it("tracks checkout_opened and checkout_back", () => {
    trackCheckoutOpened({ source: "signup_trial_step" });
    trackCheckoutBack({ source: "gate" });

    expect(capture).toHaveBeenNthCalledWith(1, "checkout_opened", {
      source: "signup_trial_step",
    });
    expect(capture).toHaveBeenNthCalledWith(2, "checkout_back", {
      source: "gate",
    });
  });

  it("tracks trial funnel steps with source and method", () => {
    trackTrialStepViewed({ source: "signup_trial_step", method: "email" });
    trackTrialStepCompleted({ source: "welcome_modal", method: "google" });
    trackTrialStepAbandoned({ source: "anon_nudge", method: "email" });

    expect(capture).toHaveBeenNthCalledWith(1, "signup_step_viewed", {
      step_name: "trial_step_viewed",
      step: "trial_step_viewed",
      source: "signup_trial_step",
      method: "email",
    });
    expect(capture).toHaveBeenNthCalledWith(2, "signup_step_viewed", {
      step_name: "trial_step_completed",
      step: "trial_step_completed",
      source: "welcome_modal",
      method: "google",
    });
    expect(capture).toHaveBeenNthCalledWith(3, "signup_step_viewed", {
      step_name: "trial_step_abandoned",
      step: "trial_step_abandoned",
      source: "anon_nudge",
      method: "email",
    });
  });
});
