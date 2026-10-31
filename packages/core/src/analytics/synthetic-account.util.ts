import { isInternalOrTestEmail } from "@core/analytics/posthog-audience.util";
import { normalizeEmail } from "@core/util/email.util";

export const COMPASS_SYNTHETIC_ACCOUNT_HEADER = "x-compass-synthetic-account";

export const POSTHOG_IS_SYNTHETIC_PROPERTY = "is_synthetic" as const;

const SYNTHETIC_JOURNEY_LOCAL_TAG = /\+journey/i;
const SYNTHETIC_TEST_DOMAIN = "@compasscaltest.invalid";

/** PostHog person / event flags for cohorts that exclude automation accounts. */
export function syntheticAccountPosthogFlags(): Record<string, boolean> {
  return {
    $internal_or_test_user: true,
    [POSTHOG_IS_SYNTHETIC_PROPERTY]: true,
  };
}

function localPart(email: string): string {
  const at = email.indexOf("@");
  return at < 0 ? email : email.slice(0, at);
}

/** Same person when `base+tag@domain` matches configured `base@domain`. */
export function emailMatchesSyntheticJourneyBase(
  email: string,
  baseEmail: string,
): boolean {
  const normalized = normalizeEmail(email);
  const base = normalizeEmail(baseEmail);
  if (normalized === base) return true;

  const at = normalized.lastIndexOf("@");
  const baseAt = base.lastIndexOf("@");
  if (at < 0 || baseAt < 0) return false;
  if (normalized.slice(at) !== base.slice(baseAt)) return false;

  const local = localPart(normalized);
  const baseLocal = localPart(base);
  const localRoot = local.split("+")[0] ?? local;
  const baseRoot = baseLocal.split("+")[0] ?? baseLocal;
  return localRoot === baseRoot;
}

/**
 * Journey, fixture, and team inboxes that must not pollute funnels or receive
 * product email. `journeyBaseEmails` comes from operator config (the same
 * addresses as GitHub journey secrets).
 */
export function isSyntheticAccountEmail(
  email: string,
  journeyBaseEmails: readonly string[] = [],
): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  if (isInternalOrTestEmail(normalized)) return true;
  if (normalized.endsWith(SYNTHETIC_TEST_DOMAIN)) return true;
  if (SYNTHETIC_JOURNEY_LOCAL_TAG.test(localPart(normalized))) return true;
  return journeyBaseEmails.some((base) =>
    emailMatchesSyntheticJourneyBase(normalized, base),
  );
}

/**
 * Inboxes that skip Stripe billing gates and persisted automation flags.
 * Unlike {@link isSyntheticAccountEmail}, the Playwright-only
 * `@compasscaltest.invalid` domain is excluded unless it carries a `+journey`
 * tag so staging can exercise the real trial funnel without polluting prod
 * analytics (those addresses stay synthetic in PostHog via
 * `isSyntheticAccountEmail`).
 */
export function isBillingAutomationBypassEmail(
  email: string,
  journeyBaseEmails: readonly string[] = [],
): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  if (isInternalOrTestEmail(normalized)) return true;
  if (SYNTHETIC_JOURNEY_LOCAL_TAG.test(localPart(normalized))) return true;
  return journeyBaseEmails.some((base) =>
    emailMatchesSyntheticJourneyBase(normalized, base),
  );
}

export function isSyntheticAccountHeaderValue(
  value: string | string[] | undefined,
): boolean {
  if (value === undefined) return false;
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim().toLowerCase();
  return trimmed === "1" || trimmed === "true" || trimmed === "yes";
}

/** Redact journey plus-address local parts in CI logs while keeping +journey digits. */
export function redactJourneyEmailForLog(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const journeySuffix = local.match(/\+journey\d+$/i)?.[0];
  if (journeySuffix) {
    const before = local.slice(0, local.length - journeySuffix.length);
    const plus = before.indexOf("+");
    const safeLocal =
      plus >= 0
        ? `${before.slice(0, plus)}+***${journeySuffix}`
        : `${before}${journeySuffix}`;
    return `${safeLocal}@${domain}`;
  }
  const plus = local.indexOf("+");
  const safeLocal =
    plus >= 0 ? `${local.slice(0, plus)}+***` : `${local.slice(0, 2)}***`;
  return `${safeLocal}@${domain}`;
}
