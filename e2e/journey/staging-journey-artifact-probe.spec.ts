import { test } from "@playwright/test";
import { COMPASS_SYNTHETIC_ACCOUNT_HEADER } from "@core/analytics/synthetic-account.util";
import { dismissBringYourEventsPromptIfOpen } from "../utils/event-test-utils";
import {
  cleanupProdJourneyAccount,
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

const stagingProbeCleanupTarget = {
  email: "",
  password: "",
  pending: false,
};

test.use({ storageState: { cookies: [], origins: [] } });
test.use({ viewport: { width: 1280, height: 800 } });
test.use({
  extraHTTPHeaders: {
    [COMPASS_SYNTHETIC_ACCOUNT_HEADER]: "true",
  },
});

test.afterEach(async ({ page }, testInfo) => {
  if (!stagingProbeCleanupTarget.pending) return;
  const { email, password } = stagingProbeCleanupTarget;
  stagingProbeCleanupTarget.pending = false;
  testInfo.setTimeout(180_000);
  await cleanupProdJourneyAccount(page, {
    email,
    password,
    scope: "STAGING",
  });
});

test(`staging journey artifact probe (${provider || "unset"})`, async ({
  page,
}) => {
  test.skip(
    process.env.STAGING_JOURNEY_ARTIFACT_PROBE !== "1",
    "Set STAGING_JOURNEY_ARTIFACT_PROBE=1 to run the artifact probe",
  );
  test.skip(
    !isJourneyEnabled("STAGING"),
    "Set STAGING_JOURNEY_ENABLED=1 to run against staging",
  );

  const { accountEmail, password } = journeyCredentials("STAGING");
  await seedJourneyOnboarding(page, { snoozeConnectPrompt: true });

  const uniqueEmail = uniqueJourneyEmail(accountEmail);
  await signUpJourneyAccount(page, {
    name: "Staging Artifact Probe",
    email: uniqueEmail,
    password,
  });
  await waitForJourneySignUpComplete(page);

  stagingProbeCleanupTarget.email = uniqueEmail;
  stagingProbeCleanupTarget.password = password;
  stagingProbeCleanupTarget.pending = true;
  await registerJourneyAccountForCleanup("STAGING", {
    email: uniqueEmail,
    password,
  });

  throw new Error("Staging journey artifact probe forced failure");
});
