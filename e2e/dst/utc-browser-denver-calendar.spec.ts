import { expect, test } from "@playwright/test";
import {
  dismissOnboardingBeforeBoot,
  forceIntlTimeZoneToUtc,
  openEventForEditingWithKeyboard,
  prepareCalendarPage,
} from "../utils/event-test-utils";
import { seedLocalEvents } from "../utils/local-event-seed.util";
import { evaluateWeekGridEventAlignment } from "../utils/week-grid-alignment.util";

const DENVER = "America/Denver";
const WEEK_START = "2026-10-18";
const FROZEN_CLOCK = "2026-10-21T12:25:00-06:00";
const FROZEN_NOW_MINUTES = 12 * 60 + 25;
const PROBE_TITLE = "UTC host Denver probe";

async function seedAlignmentProbe(page: import("@playwright/test").Page) {
  await seedLocalEvents(page, [
    {
      id: `06${"b".repeat(22)}`,
      content: { kind: "details", title: PROBE_TITLE, description: "" },
      schedule: {
        kind: "timed",
        start: "2026-10-22T16:00:00.000Z",
        end: "2026-10-22T16:45:00.000Z",
        timeZone: DENVER,
      },
      createdAt: "2026-11-01T00:00:00.000Z",
    },
  ]);
}

test.describe("UTC browser with Denver calendar zone", () => {
  test.use({
    timezoneId: "UTC",
    viewport: { width: 1280, height: 900 },
  });

  test("gutter, events, and form times follow Denver when device zone is UTC", async ({
    page,
  }) => {
    await dismissOnboardingBeforeBoot(page, { calendarTimeZone: DENVER });
    await forceIntlTimeZoneToUtc(page);
    await page.clock.install({ time: new Date(FROZEN_CLOCK) });
    await prepareCalendarPage(page);
    await page.evaluate((zone) => {
      localStorage.setItem("compass.timezone.default", zone);
    }, DENVER);
    await page.goto(`/week/${WEEK_START}`, { waitUntil: "domcontentloaded" });
    await page.locator("#mainGrid").waitFor({ state: "visible" });
    await seedAlignmentProbe(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#mainGrid").waitFor({ state: "visible" });

    await expect(
      page.getByRole("button", { name: /Calendar timezone:/ }),
    ).toHaveText(/MDT|MST/);

    const gutterSample = await page.evaluate(() => {
      const grid = document.getElementById("mainGrid");
      const gutter = grid?.querySelector(':scope > div[aria-hidden="true"]');
      const primary = gutter?.querySelector(":scope > div:last-child");
      const labels = [...(primary?.querySelectorAll("span") ?? [])].map(
        (node) => node.textContent?.trim() ?? "",
      );
      return labels.filter((label) => label.length > 0).slice(0, 8);
    });
    expect(gutterSample[0]).toBe("1 AM");
    expect(gutterSample[5]).toBe("6 AM");

    await expect(
      page.locator("#timedEvents").getByRole("button", { name: PROBE_TITLE }),
    ).toBeVisible({ timeout: 15_000 });

    const alignment = await evaluateWeekGridEventAlignment(
      page,
      new RegExp(PROBE_TITLE, "i"),
      "10 AM",
      { expectNowLineMinutes: FROZEN_NOW_MINUTES },
    );
    expect(alignment.ok, JSON.stringify(alignment)).toBe(true);

    await openEventForEditingWithKeyboard(page, PROBE_TITLE);
    const form = page.getByRole("form");
    await expect(form).toBeVisible();
    await expect(form).toContainText("10 AM");
    await expect(form).toContainText("10:45 AM");

    await page.locator("#mainSection").screenshot({
      path: test.info().outputPath("utc-browser-denver-calendar.png"),
    });
  });
});
