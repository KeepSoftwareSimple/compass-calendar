import { expect, test } from "@playwright/test";
import {
  dismissOnboardingBeforeBoot,
  forceIntlTimeZoneToUtc,
  prepareCalendarPage,
} from "../utils/event-test-utils";

const DENVER = "America/Denver";
const WEEK_START = "2026-10-18";

test.describe("Unreliable UTC device zone", () => {
  test.use({
    timezoneId: DENVER,
    viewport: { width: 1280, height: 900 },
  });

  test("keeps Denver grid and hides mismatch banner when Intl reports UTC", async ({
    page,
  }) => {
    await dismissOnboardingBeforeBoot(page, { calendarTimeZone: DENVER });
    await forceIntlTimeZoneToUtc(page);
    await page.clock.install({ time: new Date("2026-10-21T12:25:00-06:00") });
    await prepareCalendarPage(page);
    await page.goto(`/week/${WEEK_START}`, { waitUntil: "domcontentloaded" });
    await page.locator("#mainGrid").waitFor({ state: "visible" });

    await expect(
      page.getByRole("button", { name: /Calendar timezone:/ }),
    ).toHaveText(/MDT|MST/);
    await expect(
      page.getByRole("region", { name: "Timezone mismatch" }),
    ).toHaveCount(0);
  });
});
