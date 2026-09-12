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
        google: { isConfigured: true },
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

  const google = welcomeDialog.getByRole("button", {
    name: "Continue with Google",
  });
  const email = welcomeDialog.getByRole("button", {
    name: "Sign up with email",
  });
  const explore = welcomeDialog.getByRole("button", {
    name: "Explore without an account",
  });
  await expect(google).toBeVisible();
  await expect(email).toBeVisible();
  await expect(explore).toBeVisible();

  const googleBox = await google.boundingBox();
  const emailBox = await email.boundingBox();
  const exploreBox = await explore.boundingBox();
  expect(googleBox).not.toBeNull();
  expect(emailBox).not.toBeNull();
  expect(exploreBox).not.toBeNull();
  expect(googleBox?.width).toBe(emailBox?.width);
  expect(exploreBox?.width).toBe(emailBox?.width);
});
