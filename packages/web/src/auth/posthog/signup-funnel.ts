import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { track } from "@web/auth/posthog/track";

/**
 * The signup funnel, as one enumerable vocabulary.
 *
 * `track.ts` stays the flat catalog of event names with deliberately untyped
 * properties. This module is the one place that knows the *shape* of the
 * signup funnel, so a step name can't be invented at a call site and quietly
 * split a PostHog funnel in two.
 *
 * Every legacy event (`signup_started`, `signup_completed`, ...) keeps firing
 * with its existing name and properties. `signup_step_viewed` is additive: a
 * second, complete view of the same journey that existing insights ignore.
 */
export type SignupStep =
  | "welcome_viewed"
  | "signup_cta_clicked"
  | "auth_modal_opened"
  | "signup_form_submitted"
  | "oauth_redirect_started"
  /**
   * Fired before any branch in the provider callback, so a user who returns
   * from the provider is counted even when the exchange then fails. This is
   * what separates "never came back" from "came back and we broke it".
   */
  | "oauth_callback_returned"
  | "account_created"
  | "connect_prompt_shown"
  | "calendar_connected";

export type SignupMethod = "email" | ProviderKind;

/**
 * Exactly the `source` values already in the wild, typed rather than changed,
 * so existing `signup_started` insights stay byte-identical.
 */
export type SignupSource =
  | "welcome_modal"
  | `welcome_modal_${ProviderKind}`
  | "anon_nudge"
  | "command_palette"
  | "shortcut_showcase";

export type SignupFailureReason =
  | "oauth_user_cancelled"
  | "oauth_missing_state"
  | "oauth_missing_intent"
  | "oauth_missing_code"
  | "oauth_missing_scopes"
  | "oauth_exchange_failed"
  | "oauth_callback_crashed"
  | "email_field_error"
  | "email_not_allowed"
  | "email_request_failed"
  | "connect_declined"
  | "connect_missing_scopes"
  | "connect_state_mismatch"
  | "connect_consent_required"
  | "connect_error";

type StepProperties = {
  method?: SignupMethod;
  source?: SignupSource;
};

type FailureProperties = {
  method?: SignupMethod;
  step?: SignupStep;
};

export function trackSignupStep(
  step: SignupStep,
  properties: StepProperties = {},
): void {
  track("signup_step_viewed", { step_name: step, ...compact(properties) });
}

export function trackSignupFailed(
  reason: SignupFailureReason,
  properties: FailureProperties = {},
): void {
  track("signup_failed", { reason_code: reason, ...compact(properties) });
}

/** Legacy `signup_started` plus its funnel step, so both stay in lockstep. */
export function trackSignupStarted(source: SignupSource): void {
  track("signup_started", { source });
  trackSignupStep("signup_cta_clicked", { source });
}

/** Legacy `signup_completed` plus its funnel step. */
export function trackSignupCompleted(method: SignupMethod): void {
  track("signup_completed", { method });
  trackSignupStep("account_created", { method });
}

/** PostHog renders an explicit `undefined` as a property; drop those instead. */
function compact(properties: StepProperties & FailureProperties) {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined),
  );
}
