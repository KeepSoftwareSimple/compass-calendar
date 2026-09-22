import { expect, test } from "@playwright/test";
import { expectNoAxeViolations } from "../utils/axe-assertion";

test.use({ storageState: { cookies: [], origins: [] } });
test.use({ viewport: { width: 1600, height: 900 } });

test("the welcome dialog has no automatically detectable accessibility violations", async ({
  page,
}) => {
  await page.goto("/week", { waitUntil: "domcontentloaded" });

  const welcomeDialog = page.getByRole("dialog", {
    name: "Welcome to Compass Calendar",
  });
  await expect(welcomeDialog).toBeVisible();

  await expectNoAxeViolations(page, {
    checkpoint: "welcome modal",
    include: '[role="dialog"][aria-label="Welcome to Compass Calendar"]',
  });
});

test("exploring without an account returns focus to the week view without trapping", async ({
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
  await welcomeDialog
    .getByRole("button", { name: "Explore without an account" })
    .click();
  await expect(welcomeDialog).toBeHidden();

  await page.keyboard.press("Tab");
  const active = page.locator(":focus");
  await expect(active).toBeVisible();
  await expect(active).not.toHaveAttribute(
    "aria-label",
    "Welcome to Compass Calendar",
  );
});

test("the sidebar Hide tips control is keyboard reachable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
    localStorage.setItem(
      "compass.onboarding.has-seen-shortcut-showcase",
      "true",
    );
    localStorage.setItem("compass.onboarding.first-event-done", "dismissed");
  });

  await page.goto("/week", { waitUntil: "domcontentloaded" });

  const hideTips = page.getByRole("button", { name: "Hide tips" });
  await expect(hideTips).toBeVisible({ timeout: 15000 });
  await hideTips.focus();
  await expect(hideTips).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(hideTips).toHaveCount(0);
});
