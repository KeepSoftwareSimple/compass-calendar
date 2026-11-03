import { expect, test } from "@playwright/test";

const ARTIFACT_DIR = "/opt/cursor/artifacts";
const BASE =
  process.env.STAGING_BASE_URL ?? "https://staging.compasscalendar.com";

test.describe("staging onboarding/signup capture", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("welcome keyboard shortcuts step", async ({ page }) => {
    test.skip(
      process.env.STAGING_ONBOARDING_CAPTURE !== "1",
      "Set STAGING_ONBOARDING_CAPTURE=1 to run against staging",
    );

    for (const { width, height, suffix } of [
      { width: 1280, height: 800, suffix: "1280" },
      { width: 360, height: 740, suffix: "360" },
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto(`${BASE}/week`, { waitUntil: "domcontentloaded" });

      const welcomeDialog = page.getByRole("dialog", {
        name: "Welcome to Compass Calendar",
      });
      await expect(welcomeDialog).toBeVisible();
      await welcomeDialog
        .getByRole("button", { name: "Get started for free" })
        .click();
      await welcomeDialog.getByRole("button", { name: "Next" }).click();
      await welcomeDialog
        .getByRole("button", { name: "On this device only" })
        .click();
      await expect(welcomeDialog.getByText("Step 4 of 4")).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        welcomeDialog.getByRole("heading", { name: "Essential shortcuts" }),
      ).toBeVisible();
      await welcomeDialog
        .getByRole("button", { name: "Continue to calendar" })
        .waitFor({ state: "visible" });

      await page.screenshot({
        path: `${ARTIFACT_DIR}/staging-welcome-shortcuts-step-${suffix}.png`,
        fullPage: false,
      });
    }
  });

  test("first-event prompt with C keycap", async ({ page }) => {
    test.skip(
      process.env.STAGING_ONBOARDING_CAPTURE !== "1",
      "Set STAGING_ONBOARDING_CAPTURE=1 to run against staging",
    );

    await page.addInitScript(() => {
      localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
      localStorage.setItem(
        "compass.onboarding.has-seen-shortcut-showcase",
        "true",
      );
      localStorage.removeItem("compass.onboarding.first-event-done");
    });

    for (const { width, height, suffix } of [
      { width: 1280, height: 800, suffix: "1280" },
      { width: 360, height: 740, suffix: "360" },
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto(`${BASE}/week`, { waitUntil: "domcontentloaded" });

      const prompt = page.getByRole("complementary", {
        name: "Create your first event",
      });
      await expect(prompt).toBeVisible({ timeout: 30_000 });
      await expect(
        prompt.getByRole("button", { name: "Add event" }),
      ).toBeVisible();
      await expect(prompt).toHaveCSS("opacity", "1", { timeout: 10_000 });

      await page.screenshot({
        path: `${ARTIFACT_DIR}/staging-first-event-prompt-${suffix}.png`,
        fullPage: false,
      });
    }
  });

  test("signup provider layout without connect heading", async ({ page }) => {
    test.skip(
      process.env.STAGING_ONBOARDING_CAPTURE !== "1",
      "Set STAGING_ONBOARDING_CAPTURE=1 to run against staging",
    );

    for (const { width, height, suffix } of [
      { width: 1280, height: 800, suffix: "1280" },
      { width: 360, height: 740, suffix: "360" },
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto(`${BASE}/week?auth=signup`, {
        waitUntil: "domcontentloaded",
      });

      const dialog = page.getByRole("dialog", { name: "Nice to meet you" });
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByRole("heading", { name: "Connect a calendar account" }),
      ).toHaveCount(0);
      await expect(
        dialog.getByText("Pick Google, Microsoft, or Apple"),
      ).toHaveCount(0);
      for (const label of [
        /Continue with Google/i,
        /Continue with Microsoft/i,
        /Continue with Apple/i,
      ]) {
        await expect(dialog.getByRole("button", { name: label })).toBeVisible();
      }

      await page.screenshot({
        path: `${ARTIFACT_DIR}/staging-signup-providers-${suffix}.png`,
        fullPage: false,
      });
    }
  });
});
