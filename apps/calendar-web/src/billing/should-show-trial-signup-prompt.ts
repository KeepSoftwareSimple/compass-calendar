import { type AppAccess } from "@web/billing/useAppAccess";

/**
 * True for surfaces that should offer "Start free trial" (anonymous explore,
 * or a signed-in account that still needs checkout). Paying, trialing, and
 * past_due subscribers never see trial signup prompts.
 */
export function shouldShowTrialSignupPrompt(
  access: AppAccess,
  authenticated: boolean,
): boolean {
  if (!authenticated) {
    return true;
  }

  if (access.kind !== "server") {
    return false;
  }

  const { status } = access;
  if (status === "active" || status === "trialing" || status === "past_due") {
    return false;
  }

  if (status === "awaiting_checkout" || status === "none") {
    return true;
  }

  return false;
}
