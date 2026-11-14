import { expect, test } from "@playwright/test";
import { E2E_APP_CONFIG_VERSION } from "../utils/test-constants";

test.use({ storageState: { cookies: [], origins: [] } });
test.use({ viewport: { width: 1600, height: 900 } });

test("keeps Google, email signup, and explore buttons the same width", async ({
  page,
}) => {
  await page.route("**/api/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        version: E2E_APP_CONFIG_VERSION,
        providers: {
          google: { signIn: true, connect: true },
          microsoft: { signIn: false, connect: false },
          apple: { signIn: false, connect: false },
        },
      }),
    });
  });

  await page.goto("/week", { waitUntil: "domcontentloaded" });

  const welcomeDialog = page.getByRole("dialog", {
    name: "Welcome to Compass Calendar",
  });
  await expect(welcomeDialog).toBeVisible();
  await welcomeDialog
    .getByRole("button", { name: "Get started for free" })
    .click();
  await welcomeDialog.getByRole("button", { name: "Next" }).click();

  const trialPrimary = welcomeDialog.getByRole("button", {
    name: "Start free trial with Google",
  });
  const email = welcomeDialog.getByRole("button", {
    name: "Sign up with email",
  });
  const explore = welcomeDialog.getByRole("button", {
    name: "Start without an account",
  });
  await expect(trialPrimary).toBeVisible();
  await expect(email).toBeVisible();
  await expect(explore).toBeVisible();

  const trialBox = await trialPrimary.boundingBox();
  const emailBox = await email.boundingBox();
  expect(trialBox).not.toBeNull();
  expect(emailBox).not.toBeNull();
  expect(trialBox?.width).toBe(emailBox?.width);
});
