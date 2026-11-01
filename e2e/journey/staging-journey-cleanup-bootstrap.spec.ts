import { test } from "@playwright/test";
import { COMPASS_SYNTHETIC_ACCOUNT_HEADER } from "@core/analytics/synthetic-account.util";
import { dismissBringYourEventsPromptIfOpen } from "../utils/event-test-utils";
import {
  isJourneyEnabled,
  journeyCredentials,
  journeyProvider,
  registerJourneyAccountForCleanup,
  seedJourneyOnboarding,
  signUpJourneyAccount,
  uniqueJourneyEmail,
  waitForJourneySignUpComplete,
} from "./journey-leg.util";

const provider = journeyProvider("STAGING");

test.use({ storageState: { cookies: [], origins: [] } });
test.use({ viewport: { width: 1280, height: 800 } });
test.use({
  extraHTTPHeaders: {
    [COMPASS_SYNTHETIC_ACCOUNT_HEADER]: "true",
  },
});

test(`staging journey cleanup bootstrap (${provider || "unset"})`, async ({
  page,
}) => {
  test.skip(
    process.env.STAGING_JOURNEY_CLEANUP_BOOTSTRAP !== "1",
    "Set STAGING_JOURNEY_CLEANUP_BOOTSTRAP=1 to seed a pending cleanup account",
  );
  test.skip(
    !isJourneyEnabled("STAGING"),
    "Set STAGING_JOURNEY_ENABLED=1 to run against staging",
  );

  const { accountEmail, password } = journeyCredentials("STAGING");
  await seedJourneyOnboarding(page, { snoozeConnectPrompt: true });

  const uniqueEmail = uniqueJourneyEmail(accountEmail);
  await signUpJourneyAccount(page, {
    name: "Staging Cleanup Bootstrap",
    email: uniqueEmail,
    password,
  });
  await waitForJourneySignUpComplete(page);

  await registerJourneyAccountForCleanup("STAGING", {
    email: uniqueEmail,
    password,
  });

  await dismissBringYourEventsPromptIfOpen(page);
  await page.goto("/week");
});
