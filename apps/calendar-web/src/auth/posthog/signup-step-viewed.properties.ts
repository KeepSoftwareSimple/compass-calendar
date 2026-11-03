import { type ProductEventProperties } from "@web/auth/posthog/track";

/**
 * Canonical signup funnel steps for `signup_step_viewed`.
 * PostHog insights break down on the `step` property; keep names stable.
 */
export const SIGNUP_STEPS = [
  "welcome_viewed",
  "signup_cta_clicked",
  "auth_modal_opened",
  "signup_form_submitted",
  "oauth_redirect_started",
  "oauth_callback_returned",
  "account_created",
  "connect_prompt_shown",
  "calendar_connected",
  "permissions_explainer_shown",
  "google_oauth_scopes_recovery_viewed",
  "google_oauth_scopes_recovery_retry_clicked",
  "google_oauth_scopes_recovery_succeeded",
  "trial_step_viewed",
  "trial_step_completed",
  "trial_step_abandoned",
] as const;

export type SignupStep = (typeof SIGNUP_STEPS)[number];

export type SignupStepViewedProperties = ProductEventProperties & {
  step: SignupStep;
  step_name: SignupStep;
};

export function isSignupStep(value: unknown): value is SignupStep {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    (SIGNUP_STEPS as readonly string[]).includes(value)
  );
}

/** Builds the PostHog payload; throws when step is missing or not in the vocabulary. */
export function signupStepViewedProperties(
  step: SignupStep,
  extra: Record<string, boolean | number | string | undefined> = {},
): SignupStepViewedProperties {
  if (!isSignupStep(step)) {
    throw new Error("signup_step_viewed requires a non-empty step");
  }
  const properties: SignupStepViewedProperties = {
    step_name: step,
    step,
  };
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) {
      properties[key] = value;
    }
  }
  return properties;
}
