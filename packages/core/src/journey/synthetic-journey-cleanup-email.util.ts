export type JourneyCleanupEnvironment = "staging" | "production";

/** Tyler-approved production leftover accounts only. */
export const PROD_SYNTHETIC_JOURNEY_CLEANUP_EMAIL_PATTERN =
  /^lance\.essert\+prod-journey-[a-z]+\+journey\d+@gmail\.com$/;

/** Staging journey plus-tag signups from configured base emails. */
export const STAGING_SYNTHETIC_JOURNEY_CLEANUP_EMAIL_PATTERN =
  /^lance\.essert\+journey\d+@gmail\.com$/;

export function isAllowedSyntheticJourneyCleanupEmail(
  email: string,
  environment: JourneyCleanupEnvironment,
): boolean {
  const normalized = email.trim().toLowerCase();
  if (environment === "production") {
    return PROD_SYNTHETIC_JOURNEY_CLEANUP_EMAIL_PATTERN.test(normalized);
  }
  return STAGING_SYNTHETIC_JOURNEY_CLEANUP_EMAIL_PATTERN.test(normalized);
}

export function journeyPendingAccountResultsSubdir(
  environment: JourneyCleanupEnvironment,
): "prod-journey" | "staging-journey" {
  return environment === "production" ? "prod-journey" : "staging-journey";
}

export function assertAllowedSyntheticJourneyCleanupEmails(
  emails: readonly string[],
  environment: JourneyCleanupEnvironment,
): void {
  for (const raw of emails) {
    const email = raw.trim();
    if (!email) continue;
    if (isAllowedSyntheticJourneyCleanupEmail(email, environment)) continue;
    throw new Error(
      `Refusing cleanup: "${email}" does not match the allowed ${environment} synthetic journey pattern`,
    );
  }
}
