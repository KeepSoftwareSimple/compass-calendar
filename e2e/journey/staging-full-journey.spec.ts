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

const provider = (process.env.STAGING_JOURNEY_PROVIDER ?? "").toLowerCase();

const requireEnv = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `Missing ${name}. Add it to the staging-journey GitHub Environment secrets before this leg can run.`,
    );
  }
  return value;
};

const credentialEnvPrefix = (): string => {
  if (provider === "google") return "STAGING_JOURNEY_GOOGLE";
  if (provider === "microsoft") return "STAGING_JOURNEY_MICROSOFT";
  if (provider === "apple") return "STAGING_JOURNEY_APPLE";
  throw new Error(
    `STAGING_JOURNEY_PROVIDER must be google, microsoft, or apple (got "${provider}").`,
  );
};

test.use({ storageState: { cookies: [], origins: [] } });
test.use({ viewport: { width: 1280, height: 800 } });
test.use({
  extraHTTPHeaders: {
    [COMPASS_SYNTHETIC_ACCOUNT_HEADER]: "true",
  },
});

test(`staging full journey (${provider || "unset"})`, async ({ page }) => {
  test.skip(
    process.env.STAGING_JOURNEY_ENABLED !== "1",
    "Set STAGING_JOURNEY_ENABLED=1 to run against staging",
  );

  const prefix = credentialEnvPrefix();
  const accountEmail = requireEnv(`${prefix}_EMAIL`);
  const accountPassword = requireEnv(`${prefix}_PASSWORD`);

  await page.addInitScript(() => {
    localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
    localStorage.setItem(
      "compass.onboarding.has-seen-shortcut-showcase",
      "true",
    );
    localStorage.setItem("compass.onboarding.first-event-done", "dismissed");
    localStorage.setItem(
      "compass.onboarding.has-dismissed-connect-calendar-prompt",
      String(Date.now()),
    );
  });

  const uniqueEmail = accountEmail.includes("@")
    ? accountEmail.replace("@", `+journey${Date.now()}@`)
    : `journey.${Date.now()}@compasscaltest.invalid`;
  const password = accountPassword;

  await page.goto("/week?auth=signup", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Name").fill("Staging Journey");
  await page.getByLabel("Email").fill(uniqueEmail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign up" }).click();

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

  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Log out" }).click();
  await page
    .getByRole("dialog", { name: /log out/i })
    .getByRole("button", {
      name: "Log out",
    })
    .click();
  await expect(page.getByText(/logged out/i)).toBeVisible({ timeout: 30_000 });

  await page.goto("/week?auth=login", { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(uniqueEmail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
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

  await page.getByRole("button", { name: "Open settings" }).click();
  const settingsDialog = page.getByRole("dialog", { name: "Settings" });
  await expect(settingsDialog).toBeVisible({ timeout: 15_000 });
  await settingsDialog.getByRole("button", { name: "Delete account" }).click();
  const deleteDialog = page.getByRole("dialog", {
    name: /delete your compass account/i,
  });
  await expect(deleteDialog).toBeVisible({ timeout: 15_000 });
  await deleteDialog.getByLabel(/type/i).fill("Delete my Compass account");
  await deleteDialog.getByRole("button", { name: "Delete account" }).click();
  await expect(page.getByText(/until our sails cross paths/i)).toBeVisible({
    timeout: 60_000,
  });
});
