import { type CaptureResult } from "posthog-js";
import {
  isInternalOrTestEmail,
  isInternalOrTestHostname,
  isNonHumanUserAgent,
} from "@core/analytics/posthog-audience.util";
import { isSyntheticAccountEmail } from "@core/analytics/synthetic-account.util";

export const POSTHOG_INTERNAL_OR_TEST_USER_PROPERTY =
  "$internal_or_test_user" as const;

/** Super property registered for localhost, e2e, and flagged team accounts. */
export function posthogInternalOrTestUserRegistration(): Record<
  string,
  boolean
> {
  return { [POSTHOG_INTERNAL_OR_TEST_USER_PROPERTY]: true };
}

/**
 * Drop automated traffic before it reaches PostHog. Internal and test users
 * stay captured but carry `$internal_or_test_user` for cohort filters.
 */
export function filterPosthogAudience(
  event: CaptureResult | null,
): CaptureResult | null {
  if (!event) return null;
  if (typeof navigator !== "undefined") {
    if (isNonHumanUserAgent(navigator.userAgent)) return null;
  }
  return event;
}

export function shouldRegisterInternalOrTestUserFromBrowser(): boolean {
  if (typeof window === "undefined") return false;
  if (window.__COMPASS_E2E_TEST__) return true;
  return isInternalOrTestHostname(window.location.hostname);
}

export function shouldRegisterInternalOrTestUserFromEmail(
  email: string | null | undefined,
): boolean {
  if (!email) return false;
  return isInternalOrTestEmail(email);
}

/** Registers `$internal_or_test_user` and `is_synthetic` for journey accounts. */
export function shouldRegisterSyntheticAccount(input: {
  email: string | null | undefined;
  isSynthetic?: boolean | null;
}): boolean {
  if (input.isSynthetic) return true;
  if (!input.email) return false;
  return (
    shouldRegisterInternalOrTestUserFromEmail(input.email) ||
    isSyntheticAccountEmail(input.email)
  );
}
