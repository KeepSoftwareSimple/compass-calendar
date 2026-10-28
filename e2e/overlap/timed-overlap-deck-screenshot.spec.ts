import { expect, test } from "@playwright/test";
import { prepareCalendarPage } from "../utils/event-test-utils";

const DENVER = "America/Denver";
const WEEK_START = "2026-10-31";

type SeedEvent = {
  calendarId: string;
  end: string;
  id: string;
  start: string;
  timeZone: string;
  title: string;
};

async function seedOverlapScenario(page: import("@playwright/test").Page) {
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("compass.localCalendarId")),
    )
    .not.toBeNull();

  await page.evaluate(async (denverZone) => {
    const primary = localStorage.getItem("compass.localCalendarId");
    if (!primary) {
      throw new Error("missing local calendar id");
    }

    const seedEvents = [
      {
        calendarId: primary,
        end: "2026-11-01T02:30:00.000Z",
        id: `${"a".repeat(24)}`,
        start: "2026-11-01T01:00:00.000Z",
        timeZone: denverZone,
        title: "Monthly Ritual",
      },
      {
        calendarId: primary,
        end: "2026-11-01T02:00:00.000Z",
        id: `${"b".repeat(24)}`,
        start: "2026-11-01T01:00:00.000Z",
        timeZone: denverZone,
        title: "Unwind",
      },
      {
        calendarId: primary,
        end: "2026-11-01T01:00:00.000Z",
        id: `${"c".repeat(24)}`,
        start: "2026-11-01T00:00:00.000Z",
        timeZone: denverZone,
        title: "Update 4e2d",
      },
    ];

    const records = seedEvents.map(
      ({ calendarId, end, id, start, timeZone, title }) => ({
        version: 2,
        id,
        isDemo: false,
        event: {
          id,
          calendarId,
          content: { kind: "details", title, description: "" },
          schedule: { kind: "timed", start, end, timeZone },
          recurrence: { kind: "single" },
          createdAt: "2026-10-01T00:00:00.000Z",
          updatedAt: null,
        },
      }),
    );

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("compass-local");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction("events", "readwrite");
        const store = tx.objectStore("events");
        for (const record of records) {
          store.put(record);
        }
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }, DENVER);
}

test.describe("timed overlap deck screenshot", () => {
  test.use({
    timezoneId: DENVER,
    viewport: { width: 1600, height: 800 },
  });

  test("capture saturday overlap grid", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
      localStorage.setItem("compass.onboarding.first-event-done", "dismissed");
      localStorage.setItem(
        "compass.onboarding.has-seen-life-view-intro",
        "true",
      );
      localStorage.setItem("compass.view.sidebar-open", "false");
      localStorage.setItem("compass.timezone.default", DENVER);
    });
    await page.clock.install({ time: new Date("2026-10-28T12:00:00-06:00") });
    await prepareCalendarPage(page);
    await page.goto(`/week/${WEEK_START}`, { waitUntil: "domcontentloaded" });
    await page.locator("#mainGrid").waitFor({ state: "visible" });
    await seedOverlapScenario(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#mainGrid").waitFor({ state: "visible" });
    await expect(
      page.getByRole("button", { name: /monthly ritual/i }),
    ).toBeVisible({ timeout: 20_000 });
    await page.evaluate(() => {
      const grid = document.querySelector("#weekGridScroller");
      if (grid instanceof HTMLElement) {
        grid.scrollTop = 17 * 60;
      }
    });

    const output =
      process.env.OVERLAP_SCREENSHOT_PATH ??
      test.info().outputPath("overlap-capture.png");

    await page.locator("#mainSection").screenshot({ path: output });
  });
});
