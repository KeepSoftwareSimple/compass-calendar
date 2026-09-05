import { expect, test } from "@playwright/test";
import { prepareSignedInBookingSettingsPage } from "../booking/booking-harness";
import { expectNoAxeViolations } from "../utils/axe-assertion";

test.use({ storageState: { cookies: [], origins: [] } });
test.use({ viewport: { width: 1600, height: 900 } });

test("the connect-calendar onboarding step has no automatically detectable accessibility violations", async ({
  page,
}) => {
  await page.goto("/week", { waitUntil: "domcontentloaded" });

  const welcomeDialog = page.getByRole("dialog", {
    name: "Welcome to Compass Calendar",
  });
  await expect(welcomeDialog).toBeVisible();
  await welcomeDialog
    .getByRole("button", { name: "Get started for free" })
    .click();
  await welcomeDialog.getByRole("button", { name: "Next" }).click();
  await expect(
    welcomeDialog.getByRole("heading", {
      name: "Connect the calendar you use",
    }),
  ).toBeVisible();

  await expectNoAxeViolations(page, {
    checkpoint: "connect calendar onboarding",
    include: '[role="dialog"][aria-label="Welcome to Compass Calendar"]',
  });
});

test("the add-account chooser with Google and Microsoft has no automatically detectable accessibility violations", async ({
  page,
}) => {
  await prepareSignedInBookingSettingsPage(page, { microsoftConnect: true });
  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await settingsDialog.getByRole("button", { name: "Accounts" }).click();
  const addAccount = settingsDialog.getByRole("button", {
    name: "Add account",
  });
  await expect(addAccount).toBeVisible();
  await addAccount.click();
  await expect(settingsDialog.getByRole("menu")).toBeVisible();
  await expect(
    settingsDialog.getByRole("menuitem", { name: "Microsoft" }),
  ).toBeVisible();

  await expectNoAxeViolations(page, {
    checkpoint: "settings add-account chooser",
    include: "[role='menu']",
  });
});
