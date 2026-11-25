import { expect, test } from "@playwright/test";
import { join } from "node:path";

// Other life/navigation specs seed HAS_SEEN_LIFE_VIEW_INTRO so grid probes do not match the intro title.

test.use({ storageState: { cookies: [], origins: [] } });
test.use({ viewport: { width: 1600, height: 900 } });

test("shows the Life view intro once and dismisses with Enter or Escape", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
    localStorage.setItem(
      "compass.onboarding.has-seen-shortcut-showcase",
      "true",
    );
    localStorage.setItem("compass.onboarding.first-event-done", "dismissed");
  });

  await page.goto("/life", { waitUntil: "domcontentloaded" });

  const intro = page.getByRole("dialog", { name: "Life view" });
  await expect(intro).toBeVisible();
  await expect(intro.getByText(/grid of weeks/i)).toBeVisible();

  await page.screenshot({
    path: join(testInfo.outputDir, "life-view-intro-modal.png"),
    fullPage: true,
  });

  const gotIt = intro.getByRole("button", { name: "Got it" });
  await expect(gotIt).toBeFocused();
  const pirate = intro.getByRole("button", {
    name: "A quote from Oliver Burkeman",
  });
  const quote = page
    .getByRole("tooltip")
    .filter({ hasText: "neglect the right things" });
  await expect(quote).toBeHidden();
  await pirate.hover();
  await expect(quote).toBeVisible();
  await gotIt.hover();
  await expect(quote).toBeHidden();
  await gotIt.press("Shift+Tab");
  await expect(pirate).toBeFocused();
  await expect(quote).toBeVisible();
  await pirate.press("Tab");
  await gotIt.press("Enter");
  await expect(intro).toBeHidden();

  await page.goto("/life", { waitUntil: "domcontentloaded" });
  await expect(intro).toBeHidden();

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(intro).toBeHidden();

  await page.evaluate(() => {
    localStorage.removeItem("compass.onboarding.has-seen-life-view-intro");
  });
  await page.goto("/life", { waitUntil: "domcontentloaded" });
  await expect(intro).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(intro).toBeHidden();
  await page.goto("/life", { waitUntil: "domcontentloaded" });
  await expect(intro).toBeHidden();
});
