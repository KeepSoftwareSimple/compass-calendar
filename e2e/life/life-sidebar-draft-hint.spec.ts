import { expect, test } from "@playwright/test";
import {
  dismissOnboardingBeforeBoot,
  prepareTimedCalendarPage,
} from "../utils/event-test-utils";

test("Life sidebar does not show calendar draft hints after keyboard place-create", async ({
  page,
}) => {
  await dismissOnboardingBeforeBoot(page);
  await page.addInitScript(() => {
    localStorage.setItem("compass.onboarding.first-event-done", "completed");
    localStorage.setItem("compass.view.sidebar-open", "true");
  });
  await prepareTimedCalendarPage(page);

  await page.evaluate(() => {
    document.body.focus();
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await page.keyboard.press("Shift+ArrowDown");

  const draftHint = page.locator("[data-keyboard-place-indicator]");
  await expect(draftHint).toBeVisible({ timeout: 15_000 });

  await page.keyboard.press("l");
  await expect(page).toHaveURL(/\/life/);

  await expect(draftHint).toHaveCount(0);
  await expect(
    page
      .locator("#sidebar")
      .getByRole("status")
      .filter({ hasText: "this week" }),
  ).toBeVisible();
});
