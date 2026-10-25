import { expect, test } from "@playwright/test";
import { prepareCalendarPage } from "../utils/event-test-utils";

const DENVER = "America/Denver";
const WEEK_START = "2026-10-18";

test.describe("Timezone mismatch banner", () => {
  test.use({
    timezoneId: DENVER,
    viewport: { width: 1280, height: 900 },
  });

  test("shows shortcut hints for a real device and calendar zone difference", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
      localStorage.setItem("compass.onboarding.first-event-done", "dismissed");
      localStorage.setItem(
        "compass.onboarding.has-seen-life-view-intro",
        "true",
      );
      localStorage.setItem("compass.view.sidebar-open", "false");
      localStorage.setItem("compass.timezone.default", "America/New_York");
    });
    await page.clock.install({ time: new Date("2026-08-20T18:00:00-06:00") });
    await prepareCalendarPage(page);
    await page.goto(`/week/${WEEK_START}`, { waitUntil: "domcontentloaded" });
    await page.locator("#mainGrid").waitFor({ state: "visible" });

    const banner = page.getByRole("region", { name: "Timezone mismatch" });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText("Denver");
    await expect(banner).toContainText("New York");
    await expect(banner.getByText("H", { exact: true })).toBeVisible();
    await expect(banner.getByText("P", { exact: true })).toBeVisible();

    await banner.screenshot({
      path: test.info().outputPath("timezone-mismatch-banner-shortcuts.png"),
    });
  });
});
