import { type ProviderKind } from "@core/types/sync/identity.contracts";
import { countLocalNonDemoEvents } from "@web/auth/posthog/anon-events-created.util";
import {
  type SignupStep,
  signupStepViewedProperties,
} from "@web/auth/posthog/signup-step-viewed.properties";
import { captureProductEvent, track } from "@web/auth/posthog/track";
import { type CheckoutPanelSource } from "@web/billing/checkout-panel.store";

export type { SignupStep } from "@web/auth/posthog/signup-step-viewed.properties";

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
export type SignupMethod = "email" | ProviderKind;

const SIGNUP_METHODS: readonly SignupMethod[] = [
  "email",
  "google",
  "microsoft",
  "apple",
];

/** Narrows stored or otherwise untyped values back into the funnel vocabulary. */
export function isSignupMethod(value: unknown): value is SignupMethod {
  return (
    typeof value === "string" &&
    (SIGNUP_METHODS as readonly string[]).includes(value)
  );
}

/**
 * Exactly the `source` values already in the wild, typed rather than changed,
 * so existing `signup_started` insights stay byte-identical.
 */
export type SignupSource =
  | "welcome_modal"
  | `welcome_modal_${ProviderKind}`
  | "anon_nudge"
  | "local_mode_connect_prompt"
  | "command_palette"
  | "connect_chooser"
  | "shortcut_showcase"
  | "meeting_page_setup"
  /** Auth modal trial step (WP-02); Checkout attributes `trial_converted` with this source. */
  | "signup_trial_step";

/** Where the visitor chose to stay in anonymous local mode (not a login attempt). */
export type LocalModeSource = "anon_nudge";

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
  | "connect_account_mismatch"
  | "connect_error";

type StepProperties = {
  method?: SignupMethod;
  source?: SignupSource;
};

type FailureProperties = {
  method?: SignupMethod;
  step?: SignupStep;
  /** The underlying error text, so `reason_code` says what and this says why. */
  error?: string;
};

export function trackSignupStep(
  step: SignupStep,
  properties: StepProperties = {},
): void {
  captureProductEvent(
    "signup_step_viewed",
    signupStepViewedProperties(step, compact(properties)),
  );
}

export function trackSignupFailed(
  reason: SignupFailureReason,
  properties: FailureProperties = {},
): void {
  track("signup_failed", { reason_code: reason, ...compact(properties) });
}

type TrialStepTelemetry = {
  source: SignupSource;
  method: SignupMethod;
};

/** Card step in the auth modal (WP-02 wires the view; helpers are ready now). */
export function trackTrialStepViewed(properties: TrialStepTelemetry): void {
  trackSignupStep("trial_step_viewed", properties);
}

export function trackTrialStepCompleted(properties: TrialStepTelemetry): void {
  trackSignupStep("trial_step_completed", properties);
}

export function trackTrialStepAbandoned(properties: TrialStepTelemetry): void {
  trackSignupStep("trial_step_abandoned", properties);
}

type CheckoutTelemetry = {
  source: SignupSource | "gate" | "settings_trial_ask" | "shortcut_prompt";
};

/** Embedded Checkout mounted (trial or subscribe). */
export function trackCheckoutOpened(properties: CheckoutTelemetry): void {
  track("checkout_opened", properties);
}

/** User left embedded Checkout via Back or Esc. */
export function trackCheckoutBack(properties: CheckoutTelemetry): void {
  track("checkout_back", properties);
}

export function checkoutTelemetrySource(
  source: CheckoutPanelSource | null,
): CheckoutTelemetry["source"] {
  if (!source) return "gate";
  if (source.kind === "signup_trial_step") return "signup_trial_step";
  if (source.kind === "settings_trial_ask") return "settings_trial_ask";
  return "shortcut_prompt";
}

/** Legacy `signup_started` plus its funnel step, so both stay in lockstep. */
export function trackSignupStarted(
  source: SignupSource,
  anon_events_created?: number,
): void {
  track("signup_started", {
    source,
    ...(anon_events_created === undefined ? {} : { anon_events_created }),
  });
  trackSignupStep("signup_cta_clicked", { source });
}

/** Resolves local event count, then fires {@link trackSignupStarted}. */
export async function trackSignupStartedAtClick(
  source: SignupSource,
): Promise<void> {
  const anon_events_created = await countLocalNonDemoEvents().catch(() => 0);
  trackSignupStarted(source, anon_events_created);
}

/** Anonymous visitor chose local-only mode (e.g. sidebar "On this device only"). */
export function trackLocalModeSelected(source: LocalModeSource): void {
  track("local_mode_selected", { source });
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
