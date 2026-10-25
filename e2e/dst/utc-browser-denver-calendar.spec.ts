import { expect, test } from "@playwright/test";
import {
  openEventForEditingWithKeyboard,
  prepareCalendarPage,
} from "../utils/event-test-utils";
import { evaluateWeekGridEventAlignment } from "../utils/week-grid-alignment.util";

const DENVER = "America/Denver";
const WEEK_START = "2026-10-18";
const FROZEN_CLOCK = "2026-10-21T12:25:00-06:00";
const FROZEN_NOW_MINUTES = 12 * 60 + 25;
const PROBE_TITLE = "UTC host Denver probe";

async function seedAlignmentProbe(page: import("@playwright/test").Page) {
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("compass.localCalendarId")),
    )
    .not.toBeNull();

  await page.evaluate(
    async ({ endUtc, startUtc, timeZone, title }) => {
      const calendarId = localStorage.getItem("compass.localCalendarId");
      if (!calendarId) {
        throw new Error("missing local calendar id");
      }
      const id = `06${"b".repeat(22)}`;
      const record = {
        version: 2,
        id,
        isDemo: false,
        event: {
          id,
          calendarId,
          content: { kind: "details", title, description: "" },
          schedule: {
            kind: "timed",
            start: startUtc,
            end: endUtc,
            timeZone,
          },
          recurrence: { kind: "single" },
          createdAt: "2026-11-01T00:00:00.000Z",
          updatedAt: null,
        },
      };
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("compass-local");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("events", "readwrite");
          tx.objectStore("events").put(record);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } finally {
        db.close();
      }
    },
    {
      endUtc: "2026-10-22T16:45:00.000Z",
      startUtc: "2026-10-22T16:00:00.000Z",
      timeZone: DENVER,
      title: PROBE_TITLE,
    },
  );
}

test.describe("UTC browser with Denver calendar zone", () => {
  test.use({
    timezoneId: "UTC",
    viewport: { width: 1280, height: 900 },
  });

  test("gutter, events, and form times follow Denver when device zone is UTC", async ({
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
      localStorage.setItem("compass.timezone.default", DENVER);
      const original = Intl.DateTimeFormat.prototype.resolvedOptions;
      Intl.DateTimeFormat.prototype.resolvedOptions = function (
        this: Intl.DateTimeFormat,
      ) {
        const options = original.call(this);
        return { ...options, timeZone: "UTC" };
      };
    });
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
