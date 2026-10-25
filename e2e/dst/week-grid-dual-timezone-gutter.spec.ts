import { expect, test } from "@playwright/test";
import { prepareCalendarPage } from "../utils/event-test-utils";

const DENVER = "America/Denver";
const WEEK_START = "2026-10-18";

test.describe("Week grid dual timezone gutter", () => {
  test.use({
    timezoneId: DENVER,
    viewport: { width: 1280, height: 900 },
  });

  test("keeps Denver primary labels and UTC secondary in separate columns", async ({
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
      localStorage.setItem("compass.timezone.time-travel", "UTC");
    });
    await page.clock.install({ time: new Date("2026-10-21T12:25:00-06:00") });
    await prepareCalendarPage(page);
    await page.goto(`/week/${WEEK_START}`, { waitUntil: "domcontentloaded" });
    await page.locator("#mainGrid").waitFor({ state: "visible" });

    await expect(
      page.getByRole("button", { name: /Calendar timezone:/ }),
    ).toHaveText(/MDT|MST/);
    await expect(
      page.getByRole("button", { name: /Second timezone:/ }),
    ).toHaveText(/UTC/i);

    const columnLayout = await page.evaluate(() => {
      const grid = document.getElementById("mainGrid");
      const gutter = grid?.querySelector(':scope > div[aria-hidden="true"]');
      const columns = gutter?.querySelectorAll(":scope > div");
      if (columns?.length !== 2) {
        return { ok: false as const, count: columns?.length ?? 0 };
      }
      const rects = Array.from(columns).map((column) => {
        const rect = column.getBoundingClientRect();
        return { left: rect.left, width: rect.width };
      });
      const overlap = rects[1].left < rects[0].left + rects[0].width - 1;
      return { ok: !overlap, rects };
    });

    expect(columnLayout.ok).toBe(true);
    if ("rects" in columnLayout && columnLayout.rects) {
      expect(columnLayout.rects[0]?.width).toBeCloseTo(50, 0);
      expect(columnLayout.rects[1]?.width).toBeCloseTo(50, 0);
    }

    await page.locator("#mainSection").screenshot({
      path: test.info().outputPath("week-grid-dual-timezone-gutter.png"),
    });
  });
});
