import { expect, test } from "@playwright/test";
import { COMPASS_SYNTHETIC_ACCOUNT_HEADER } from "@core/analytics/synthetic-account.util";
import {
  createEventTitle,
  dismissBringYourEventsPromptIfOpen,
  dismissExploreTrialBannerIfOpen,
  expectTimedEventVisible,
  fillTitleAndSaveEventForm,
  openTimedEventFormWithKeyboard,
} from "../utils/event-test-utils";
import {
  deleteJourneyAccount,
  isJourneyEnabled,
  journeyCredentials,
  journeyProvider,
  logInJourneyAccount,
  logOutOfJourneyAccount,
  seedJourneyOnboarding,
  signUpJourneyAccount,
  uniqueJourneyEmail,
} from "./journey-leg.util";

const provider = journeyProvider("STAGING");

test.use({ storageState: { cookies: [], origins: [] } });
test.use({ viewport: { width: 1280, height: 800 } });
test.use({
  extraHTTPHeaders: {
    [COMPASS_SYNTHETIC_ACCOUNT_HEADER]: "true",
  },
});

test(`staging full journey (${provider || "unset"})`, async ({ page }) => {
  test.skip(
    !isJourneyEnabled("STAGING"),
    "Set STAGING_JOURNEY_ENABLED=1 to run against staging",
  );

  const { accountEmail, password } = journeyCredentials("STAGING");

  await seedJourneyOnboarding(page, { snoozeConnectPrompt: true });

  const uniqueEmail = uniqueJourneyEmail(accountEmail);

  await signUpJourneyAccount(page, {
    name: "Staging Journey",
    email: uniqueEmail,
    password,
  });

  await expect(
    page.getByRole("dialog", { name: /welcome back|trial/i }),
  ).toBeHidden({
    timeout: 120_000,
  });

  await page
    .locator("#mainGrid")
    .waitFor({ state: "visible", timeout: 30_000 });
  await dismissBringYourEventsPromptIfOpen(page);

  const connectPrompt = page.getByRole("complementary", {
    name: /connect/i,
  });
  if (await connectPrompt.isVisible().catch(() => false)) {
    throw new Error(
      `Calendar connect is required for the ${provider} leg but OAuth is not automated in this scaffold yet. Tyler: add a pre-connected test account or extend this spec with provider OAuth.`,
    );
  }
  await dismissExploreTrialBannerIfOpen(page);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  const createdTitle = createEventTitle("Journey create");
  await openTimedEventFormWithKeyboard(page);
  await fillTitleAndSaveEventForm(page, createdTitle);
  await expectTimedEventVisible(page, createdTitle);

  const editedTitle = createEventTitle("Journey edit");
  const replaceSettled = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      /\/api\/event\//.test(response.url()) &&
      response.ok(),
  );
  await page.getByRole("button", { name: createdTitle }).last().click();
  await fillTitleAndSaveEventForm(page, editedTitle);
  await replaceSettled;
  await expectTimedEventVisible(page, editedTitle);

  await logOutOfJourneyAccount(page);
  await expect(page.getByText(/logged out/i)).toBeVisible({ timeout: 30_000 });

  await logInJourneyAccount(page, { email: uniqueEmail, password });
  await page
    .locator("#mainGrid")
    .waitFor({ state: "visible", timeout: 60_000 });
  await page
    .waitForResponse(
      (response) =>
        response.url().includes("/api/calendars") && response.status() === 200,
      { timeout: 60_000 },
    )
    .catch(() => undefined);
  await expectTimedEventVisible(page, editedTitle, 60_000);

  await deleteJourneyAccount(page);
});
