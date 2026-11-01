import { expect, test } from "@playwright/test";
import { COMPASS_SYNTHETIC_ACCOUNT_HEADER } from "@core/analytics/synthetic-account.util";
import {
  createEventTitle,
  dismissBringYourEventsPromptIfOpen,
  expectTimedEventVisible,
  fillTitleAndSaveEventForm,
  openTimedEventFormWithKeyboard,
  waitForWritableCalendarsReady,
} from "../utils/event-test-utils";
import {
  cleanupProdJourneyAccount,
  isJourneyEnabled,
  journeyCredentials,
  journeyProvider,
  logInJourneyAccount,
  logOutOfJourneyAccount,
  openJourneyBillingSettings,
  openJourneyTrialStep,
  registerJourneyAccountForCleanup,
  seedJourneyOnboarding,
  signUpJourneyAccount,
  submitSyntheticProdJourneyCheckout,
  uniqueJourneyEmail,
  waitForJourneySignUpComplete,
  waitForSyntheticProdJourneyCheckoutSuccess,
} from "./journey-leg.util";

const provider = journeyProvider("PROD");

const prodJourneyCleanupTarget = {
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
  if (!prodJourneyCleanupTarget.pending) return;
  const { email, password } = prodJourneyCleanupTarget;
  prodJourneyCleanupTarget.pending = false;
  testInfo.setTimeout(180_000);
  await cleanupProdJourneyAccount(page, {
    email,
    password,
    scope: "PROD",
  });
});

test(`prod full journey (${provider || "unset"})`, async ({ page }) => {
  test.skip(
    !isJourneyEnabled("PROD"),
    "Set PROD_JOURNEY_ENABLED=1 to run against production",
  );

  const { accountEmail, password } = journeyCredentials("PROD");

  await seedJourneyOnboarding(page, { snoozeConnectPrompt: true });

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
  prodJourneyCleanupTarget.email = uniqueEmail;
  prodJourneyCleanupTarget.password = password;
  prodJourneyCleanupTarget.pending = true;
  await registerJourneyAccountForCleanup("PROD", {
    email: uniqueEmail,
    password,
  });

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
  try {
    await submitSyntheticProdJourneyCheckout(stripeFrame);
    await waitForSyntheticProdJourneyCheckoutSuccess(
      page,
      stripeFrame,
      trialDialog,
    );
  } catch (error) {
    await trialDialog.screenshot({
      path: test.info().outputPath("prod-journey-checkout-failure.png"),
    });
    const stripeText = await stripeFrame
      .locator("body")
      .innerText()
      .catch(() => "");
    if (stripeText) {
      test.info().attach("stripe-frame-on-failure", {
        body: stripeText.slice(0, 8000),
        contentType: "text/plain",
      });
    }
    throw error;
  }

  await waitForWritableCalendarsReady(page);
  await dismissBringYourEventsPromptIfOpen(page);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  const createdTitle = createEventTitle("Prod journey create");
  await openTimedEventFormWithKeyboard(page);
  await fillTitleAndSaveEventForm(page, createdTitle);
  await expectTimedEventVisible(page, createdTitle);

  const settings = await openJourneyBillingSettings(page);
  await settings.getByRole("button", { name: "Cancel subscription" }).click();
  await page
    .getByRole("dialog", { name: /cancel/i })
    .getByRole("button", { name: "Cancel subscription" })
    .click();
  // Billing has no "canceled" copy: once the server schedules the cancel,
  // the plan shows cancelAtPeriodEnd and the button becomes Resume.
  await expect(
    settings.getByRole("button", { name: "Resume subscription" }),
  ).toBeVisible({ timeout: 60_000 });
  await page.keyboard.press("Escape");

  const editedTitle = createEventTitle("Prod journey edit");
  await page.getByRole("button", { name: createdTitle }).last().click();
  await fillTitleAndSaveEventForm(page, editedTitle);
  await expectTimedEventVisible(page, editedTitle);

  await logOutOfJourneyAccount(page);

  await logInJourneyAccount(page, { email: uniqueEmail, password });
  await expectTimedEventVisible(page, editedTitle, 60_000);
});
