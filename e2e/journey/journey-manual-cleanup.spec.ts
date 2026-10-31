import { test } from "@playwright/test";
import { COMPASS_SYNTHETIC_ACCOUNT_HEADER } from "@core/analytics/synthetic-account.util";
import {
  assertAllowedSyntheticJourneyCleanupEmails,
  type JourneyCleanupEnvironment,
} from "@core/journey/synthetic-journey-cleanup-email.util";
import {
  cleanupProdJourneyAccount,
  resolveJourneyPasswordForCleanupEmail,
} from "./journey-leg.util";

test.use({ storageState: { cookies: [], origins: [] } });
test.use({ viewport: { width: 1280, height: 800 } });
test.use({
  extraHTTPHeaders: {
    [COMPASS_SYNTHETIC_ACCOUNT_HEADER]: "true",
  },
});

test("manual synthetic journey account cleanup", async ({ page }) => {
  test.skip(
    process.env.JOURNEY_MANUAL_CLEANUP_UI !== "1",
    "Set JOURNEY_MANUAL_CLEANUP_UI=1 for UI cleanup",
  );

  const environment = process.env.JOURNEY_MANUAL_CLEANUP_ENV as
    | JourneyCleanupEnvironment
    | undefined;
  if (environment !== "staging" && environment !== "production") {
    throw new Error("JOURNEY_MANUAL_CLEANUP_ENV must be staging or production");
  }

  const emails = (process.env.JOURNEY_MANUAL_CLEANUP_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  assertAllowedSyntheticJourneyCleanupEmails(emails, environment);

  const scope = environment === "production" ? "PROD" : "STAGING";
  test.setTimeout(Math.max(180_000, emails.length * 180_000));

  for (const email of emails) {
    const password = resolveJourneyPasswordForCleanupEmail(scope, email);
    await cleanupProdJourneyAccount(page, { email, password, scope });
  }
});
