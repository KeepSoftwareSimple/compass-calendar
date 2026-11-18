import { BILLING_PLAN } from "@core/constants/billing.constants";
import { type ProviderKind } from "@core/types/sync/identity.contracts";

/** OAuth provider that gets the trial primary CTA on welcome screen 3. */
export function welcomeTrialPrimaryProvider(
  available: readonly ProviderKind[],
): ProviderKind | null {
  if (available.includes("google")) return "google";
  return available[0] ?? null;
}

/** Short trial terms for welcome screen 3 (same facts as `formatTrialStartPriceLine`). */
export function welcomeTrialCardTermsLine(
  trialLengthDays: number = BILLING_PLAN.TRIAL_LENGTH_DAYS,
): string {
  return `${trialLengthDays}-day free trial. Card required.`;
}
