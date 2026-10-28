import {
  trackSignupCompleted,
  trackSignupStarted,
  trackSignupStep,
  trackTrialStepAbandoned,
  trackTrialStepCompleted,
  trackTrialStepViewed,
} from "@web/auth/posthog/signup-funnel";
import { SIGNUP_STEPS } from "@web/auth/posthog/signup-step-viewed.properties";
import { recordOAuthSignInCallbackLanding } from "@web/auth/providers/authorization/record-oauth-signin-callback-landing";
import {
  connectCalendarPromptActions,
  resetConnectCalendarPromptStoreForTests,
} from "@web/components/ConnectCalendarPrompt/connect-calendar.store";
import { emitWelcomeIntroAnalyticsOnce } from "@web/components/WelcomeModal/welcome-analytics.util";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";

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

const realFetch = globalThis.fetch;

afterAll(() => {
  isClientMocked = false;
  globalThis.fetch = realFetch;
});

/** Direct trackSignupStep call sites (web only; macOS does not emit this event). */
const SIGNUP_STEP_VIEWED_DIRECT_EMIT_STEPS = [
  "welcome_viewed",
  "connect_prompt_shown",
  "auth_modal_opened",
  "signup_form_submitted",
  "oauth_redirect_started",
  "oauth_callback_returned",
  "calendar_connected",
  "permissions_explainer_shown",
  "google_oauth_scopes_recovery_viewed",
  "google_oauth_scopes_recovery_retry_clicked",
  "google_oauth_scopes_recovery_succeeded",
] as const;

function lastSignupStepViewedPayload(): Record<string, unknown> {
  const calls = capture.mock.calls.filter(
    ([event]) => event === "signup_step_viewed",
  );
  const last = calls.at(-1);
  expect(last).toBeDefined();
  return last![1] as Record<string, unknown>;
}

function expectNonEmptyStep(step: string) {
  const payload = lastSignupStepViewedPayload();
  expect(payload.step).toBe(step);
  expect(payload.step_name).toBe(step);
  expect(typeof payload.step).toBe("string");
  expect(String(payload.step).length).toBeGreaterThan(0);
}

describe("signup_step_viewed emit sites", () => {
  beforeEach(() => {
    capture.mockClear();
    sessionStorage.clear();
    resetConnectCalendarPromptStoreForTests();
    globalThis.fetch = mock(
      async () => new Response(null, { status: 204 }),
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("covers every vocabulary step via funnel helpers", () => {
    trackSignupStarted("welcome_modal", 0);
    trackSignupCompleted("email");
    trackTrialStepViewed({ source: "signup_trial_step", method: "email" });
    trackTrialStepCompleted({ source: "signup_trial_step", method: "email" });
    trackTrialStepAbandoned({ source: "signup_trial_step", method: "email" });

    const steps = capture.mock.calls
      .filter(([event]) => event === "signup_step_viewed")
      .map(([, props]) => (props as { step: string }).step);

    expect(steps).toEqual([
      "signup_cta_clicked",
      "account_created",
      "trial_step_viewed",
      "trial_step_completed",
      "trial_step_abandoned",
    ]);
    for (const step of steps) {
      expect((SIGNUP_STEPS as readonly string[]).includes(step)).toBe(true);
    }
  });

  it("welcome analytics emits welcome_viewed with step", () => {
    emitWelcomeIntroAnalyticsOnce();
    expectNonEmptyStep("welcome_viewed");
  });

  it("connect prompt emits connect_prompt_shown with step", () => {
    connectCalendarPromptActions.markShown();
    expectNonEmptyStep("connect_prompt_shown");
  });

  it("oauth callback landing emits oauth_callback_returned with step", () => {
    recordOAuthSignInCallbackLanding("google", "?code=1");
    expectNonEmptyStep("oauth_callback_returned");
  });

  it("documents each direct emit step in the vocabulary", () => {
    for (const step of SIGNUP_STEP_VIEWED_DIRECT_EMIT_STEPS) {
      expect((SIGNUP_STEPS as readonly string[]).includes(step)).toBe(true);
    }
    trackSignupStep("permissions_explainer_shown", { method: "google" });
    expectNonEmptyStep("permissions_explainer_shown");
  });
});
