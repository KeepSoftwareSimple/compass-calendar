import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

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
  trackGoogleOAuthScopesRecoveryRetryClicked,
  trackGoogleOAuthScopesRecoverySucceeded,
  trackGoogleOAuthScopesRecoveryViewed,
} = await import("@web/auth/posthog/google-oauth-scopes-recovery-funnel");

describe("google oauth scopes recovery funnel", () => {
  beforeEach(() => {
    capture.mockClear();
  });

  it("includes step on signup_step_viewed for each recovery step", () => {
    trackGoogleOAuthScopesRecoveryViewed();
    trackGoogleOAuthScopesRecoveryRetryClicked(2);
    trackGoogleOAuthScopesRecoverySucceeded();

    const signupSteps = capture.mock.calls.filter(
      ([event]) => event === "signup_step_viewed",
    );
    expect(signupSteps).toHaveLength(3);
    expect(signupSteps[0]?.[1]).toEqual({
      step: "google_oauth_scopes_recovery_viewed",
      step_name: "google_oauth_scopes_recovery_viewed",
      method: "google",
    });
    expect(signupSteps[1]?.[1]).toEqual({
      step: "google_oauth_scopes_recovery_retry_clicked",
      step_name: "google_oauth_scopes_recovery_retry_clicked",
      method: "google",
    });
    expect(signupSteps[2]?.[1]).toEqual({
      step: "google_oauth_scopes_recovery_succeeded",
      step_name: "google_oauth_scopes_recovery_succeeded",
      method: "google",
    });
  });
});
