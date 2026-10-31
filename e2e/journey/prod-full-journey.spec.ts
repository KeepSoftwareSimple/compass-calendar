import { expect, test } from "@playwright/test";
import { COMPASS_SYNTHETIC_ACCOUNT_HEADER } from "@core/analytics/synthetic-account.util";
import {
  createEventTitle,
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
  openJourneySettings,
  openJourneyTrialStep,
  seedJourneyOnboarding,
  signUpJourneyAccount,
  uniqueJourneyEmail,
  waitForJourneySignUpComplete,
} from "./journey-leg.util";

const provider = journeyProvider("PROD");

test.use({ storageState: { cookies: [], origins: [] } });
test.use({ viewport: { width: 1280, height: 800 } });
test.use({
  extraHTTPHeaders: {
    [COMPASS_SYNTHETIC_ACCOUNT_HEADER]: "true",
  },
});

test(`prod full journey (${provider || "unset"})`, async ({ page }) => {
  test.skip(
    !isJourneyEnabled("PROD"),
    "Set PROD_JOURNEY_ENABLED=1 to run against production",
  );

  const { accountEmail, password } = journeyCredentials("PROD");

  await seedJourneyOnboarding(page);

  const uniqueEmail = uniqueJourneyEmail(accountEmail);

  let checkoutClientSecret = "";
  page.on("response", async (response) => {
    const url = new URL(response.url());
    if (!url.pathname.endsWith("/api/billing/checkout/session")) return;
    if (!response.ok()) return;
    try {
      const body = (await response.json()) as { clientSecret?: string };
      checkoutClientSecret = body.clientSecret ?? "";
    } catch {
      // A body we cannot read leaves the poll below to time out and report.
    }
  });

  await signUpJourneyAccount(page, {
    name: "Prod Journey",
    email: uniqueEmail,
    password,
  });
  await waitForJourneySignUpComplete(page);

  const trialDialog = await openJourneyTrialStep(page);
  await trialDialog.getByRole("button", { name: "Start free trial" }).click();
  await expect(trialDialog.getByRole("button", { name: "Back" })).toBeVisible({
    timeout: 120_000,
  });

  await expect
    .poll(() => checkoutClientSecret.length > 0, { timeout: 120_000 })
    .toBe(true);

  const stripeFrame = page
    .frameLocator('iframe[name*="stripe"], iframe[src*="stripe"]')
    .first();
  await stripeFrame.getByLabel("Card number").fill("4242424242424242");
  await stripeFrame.getByLabel("Expiration").fill("12/34");
  await stripeFrame.getByLabel("CVC").fill("123");
  await stripeFrame.getByLabel("ZIP").fill("80202");
  await stripeFrame.getByTestId("hosted-payment-submit-button").click({
    timeout: 120_000,
  });
  await expect(trialDialog).toBeHidden({ timeout: 180_000 });

  const createdTitle = createEventTitle("Prod journey create");
  await openTimedEventFormWithKeyboard(page);
  await fillTitleAndSaveEventForm(page, createdTitle);
  await expectTimedEventVisible(page, createdTitle);

  const settings = await openJourneySettings(page);
  await settings.getByRole("button", { name: "Cancel subscription" }).click();
  await page
    .getByRole("dialog", { name: /cancel/i })
    .getByRole("button", { name: "Cancel subscription" })
    .click();
  await expect(page.getByText(/canceled|cancelled/i)).toBeVisible({
    timeout: 60_000,
  });
  await page.keyboard.press("Escape");

  const editedTitle = createEventTitle("Prod journey edit");
  await page.getByRole("button", { name: createdTitle }).last().click();
  await fillTitleAndSaveEventForm(page, editedTitle);
  await expectTimedEventVisible(page, editedTitle);

  await logOutOfJourneyAccount(page);

  await logInJourneyAccount(page, { email: uniqueEmail, password });
  await expectTimedEventVisible(page, editedTitle, 60_000);

  await deleteJourneyAccount(page);
});
