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
  flushSignupCompletedAfterSessionReady,
  resetSignupCompletedCoordinatorForTests,
  scheduleSignupCompleted,
} = await import("@web/auth/posthog/signup-completed-coordinator");

const SIGNUP_METHODS = ["email", "google", "microsoft", "apple"] as const;

describe("signup-completed coordinator", () => {
  beforeEach(() => {
    capture.mockClear();
    resetSignupCompletedCoordinatorForTests();
    sessionStorage.clear();
  });

  it.each(SIGNUP_METHODS)(
    "fires signup_completed once per method after session ready (%s)",
    (method) => {
      scheduleSignupCompleted(method);
      flushSignupCompletedAfterSessionReady({
        userId: `user-${method}`,
        profileEmail: "real.user@gmail.com",
      });
      flushSignupCompletedAfterSessionReady({
        userId: `user-${method}`,
        profileEmail: "real.user@gmail.com",
      });

      const signupCalls = capture.mock.calls.filter(
        ([event]) => event === "signup_completed",
      );
      expect(signupCalls).toEqual([["signup_completed", { method }]]);
    },
  );

  it("does not fire signup_completed when nothing was scheduled", () => {
    flushSignupCompletedAfterSessionReady({
      userId: "user-1",
      profileEmail: "real.user@gmail.com",
    });
    expect(capture).not.toHaveBeenCalled();
  });

  it("tags synthetic journey inboxes on signup_completed", () => {
    scheduleSignupCompleted("email");
    flushSignupCompletedAfterSessionReady({
      userId: "syn-1",
      profileEmail: "runner+journey1@compasscaltest.invalid",
      isSynthetic: true,
    });

    expect(capture).toHaveBeenCalledWith("signup_completed", {
      method: "email",
      $internal_or_test_user: true,
      is_synthetic: true,
    });
  });

  it("leaves real-user signup_completed untagged", () => {
    scheduleSignupCompleted("google");
    flushSignupCompletedAfterSessionReady({
      userId: "real-1",
      profileEmail: "real.user@gmail.com",
    });

    expect(capture).toHaveBeenCalledWith("signup_completed", {
      method: "google",
    });
  });

  it("fires on a later flush when identify ran before scheduleSignupCompleted", () => {
    flushSignupCompletedAfterSessionReady({
      userId: "race-user",
      profileEmail: "real.user@gmail.com",
    });
    expect(capture).not.toHaveBeenCalled();

    scheduleSignupCompleted("google");
    flushSignupCompletedAfterSessionReady({
      userId: "race-user",
      profileEmail: "real.user@gmail.com",
    });
    const signupCalls = capture.mock.calls.filter(
      ([event]) => event === "signup_completed",
    );
    expect(signupCalls).toEqual([["signup_completed", { method: "google" }]]);
  });

  it("skips a second capture after reload when session storage is set", () => {
    scheduleSignupCompleted("microsoft");
    flushSignupCompletedAfterSessionReady({
      userId: "reload-user",
      profileEmail: "real.user@gmail.com",
    });
    scheduleSignupCompleted("microsoft");
    flushSignupCompletedAfterSessionReady({
      userId: "reload-user",
      profileEmail: "real.user@gmail.com",
    });

    const signupCalls = capture.mock.calls.filter(
      ([event]) => event === "signup_completed",
    );
    expect(signupCalls).toHaveLength(1);
  });
});
