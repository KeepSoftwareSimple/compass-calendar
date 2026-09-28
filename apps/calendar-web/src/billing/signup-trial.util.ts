import { type BillingSubscriptionResponse } from "@core/types/billing.types";
import { type AppConfig } from "@core/types/config.types";

type BillingPrice = NonNullable<BillingSubscriptionResponse["price"]>;

import dayjs from "@core/util/date/dayjs";
import { type SignupMethod } from "@web/auth/posthog/signup-funnel";
import { isBillingEnforced } from "@web/billing/billing.query";
import { formatBillingMoney } from "@web/billing/billing-display";
import { sessionBrowserStore } from "@web/common/storage/browser-key-value.store";

const SIGNUP_TRIAL_METHOD_KEY = "signupTrialMethod";

export function rememberSignupTrialMethod(method: SignupMethod): void {
  sessionBrowserStore.set(SIGNUP_TRIAL_METHOD_KEY, method);
}

export function readSignupTrialMethod(
  fallback: SignupMethod = "email",
): SignupMethod {
  const stored = sessionBrowserStore.get(SIGNUP_TRIAL_METHOD_KEY);
  if (
    stored === "email" ||
    stored === "google" ||
    stored === "microsoft" ||
    stored === "apple"
  ) {
    return stored;
  }
  return fallback;
}

export function clearSignupTrialMethod(): void {
  sessionBrowserStore.remove(SIGNUP_TRIAL_METHOD_KEY);
}

/** Hosted signup shows the in-modal trial step when billing is on and enforced. */
export function shouldOfferSignupTrialStep(
  config: AppConfig | undefined,
): boolean {
  return config?.billing.isConfigured === true && isBillingEnforced(config);
}

/** Charge date copy: "Monday, September 29" from trial length and a reference instant. */
export function formatTrialChargeDate(
  trialLengthDays: number,
  now: dayjs.Dayjs = dayjs(),
): string {
  return now.add(trialLengthDays, "day").format("dddd, MMMM D");
}

/** Same shape as Settings > Billing plan price line. */
export function formatSignupTrialPlanPrice(
  price: BillingPrice | null | undefined,
): string | null {
  if (!price) return null;
  return `${formatBillingMoney(price.amount, price.currency)} per ${price.interval}`;
}
