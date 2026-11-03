import { test } from "@playwright/test";
import { COMPASS_SYNTHETIC_ACCOUNT_HEADER } from "@core/analytics/synthetic-account.util";
import {
  cleanupProdJourneyAccount,
  isJourneyEnabled,
  journeyProvider,
} from "./journey-leg.util";
import { readPendingJourneyAccount } from "./journey-pending-account.util";

test.use({ storageState: { cookies: [], origins: [] } });
test.use({ viewport: { width: 1280, height: 800 } });
test.use({
  extraHTTPHeaders: {
    [COMPASS_SYNTHETIC_ACCOUNT_HEADER]: "true",
  },
});

test(`prod journey cleanup fallback (${journeyProvider("PROD") || "unset"})`, async ({
  page,
}) => {
  test.skip(
    process.env.PROD_JOURNEY_CLEANUP_FALLBACK !== "1",
    "Set PROD_JOURNEY_CLEANUP_FALLBACK=1 for workflow fallback cleanup",
  );
  test.skip(
    !isJourneyEnabled("PROD"),
    "Set PROD_JOURNEY_ENABLED=1 to run against production",
  );

  const pending = await readPendingJourneyAccount("PROD");
  if (!pending) {
    test.skip(true, "No pending prod journey account file");
    return;
  }

  test.setTimeout(180_000);
  await cleanupProdJourneyAccount(page, {
    email: pending.email,
    password: pending.password,
    scope: "PROD",
  });
});
