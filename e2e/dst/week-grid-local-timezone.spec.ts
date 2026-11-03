import { expect, test } from "@playwright/test";
import {
  dismissOnboardingBeforeBoot,
  prepareCalendarPage,
} from "../utils/event-test-utils";

const DENVER = "America/Denver";
const WEEK_START = "2026-10-18";

test.describe("Week grid local timezone", () => {
  test.use({
    timezoneId: DENVER,
    viewport: { width: 1280, height: 900 },
  });

  test("shows Denver time after a parity-style UTC pin in localStorage", async ({
    page,
  }) => {
    await dismissOnboardingBeforeBoot(page, { calendarTimeZone: "UTC" });
    await page.clock.install({ time: new Date("2026-10-21T12:25:00-06:00") });
    await prepareCalendarPage(page);
    await page.goto(`/week/${WEEK_START}`, { waitUntil: "domcontentloaded" });
    await page.locator("#mainGrid").waitFor({ state: "visible" });

    const timezoneButton = page.getByRole("button", {
      name: /Calendar timezone:/,
    });
    await expect(timezoneButton).toBeVisible();
    await expect(timezoneButton).not.toHaveText(/UTC/i);
    await expect(timezoneButton).toHaveText(/MDT|MST/);

    await page.locator("#mainSection").screenshot({
      path: test.info().outputPath("week-grid-denver-timezone-fixed.png"),
    });
  });
});
