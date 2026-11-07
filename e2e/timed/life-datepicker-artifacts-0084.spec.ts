import { expect, test } from "@playwright/test";
import path from "node:path";

const ARTIFACT_DIR = "/opt/cursor/artifacts";

test.describe("life datepicker artifacts 0084", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("@artifact life birth datepicker subviews", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
      localStorage.setItem("compass.onboarding.first-event-done", "dismissed");
      localStorage.setItem(
        "compass.onboarding.has-seen-life-view-intro",
        "true",
      );
      localStorage.setItem(
        "compass.life.preferences",
        JSON.stringify({
          birthDate: "1993-09-14",
          lifespan: 77,
          variation: "average",
        }),
      );
    });

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/life", { waitUntil: "domcontentloaded" });

    const openSidebar = page.getByRole("button", { name: "Open sidebar" });
    if (await openSidebar.isVisible()) {
      await openSidebar.click();
    }

    const birth = page.getByRole("textbox", { name: "Date of birth" });
    await expect(birth).toBeVisible({ timeout: 20_000 });
    await birth.click();
    const popper = page.locator(
      ".react-datepicker-popper:has(.lifeBirthDatePicker)",
    );
    await expect(popper).toBeVisible({ timeout: 15_000 });

    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "life-datepicker-day-caption-wide.png"),
    });

    await popper.getByRole("button", { name: "Choose month and year" }).click();
    await expect(popper.getByText("Select year")).toBeVisible();
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "life-datepicker-year-grid-wide.png"),
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "life-datepicker-year-grid-narrow.png"),
      fullPage: true,
    });
  });
});
