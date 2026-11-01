import { expect, test } from "@playwright/test";
import { prepareCalendarPage } from "../utils/event-test-utils";
import { seedLocalEvents } from "../utils/local-event-seed.util";

const DENVER = "America/Denver";
const WEEK_START = "2026-10-26";
const FROZEN_CLOCK = "2026-10-20T12:00:00-06:00";

const tylerSaturdayEvents = () => [
  {
    id: "507f1f77bcf86cd799439021",
    content: {
      kind: "details",
      title: "H: Fall Festival | Venture Church",
      description: "",
    },
    schedule: {
      kind: "timed",
      start: "2026-10-31T21:00:00.000Z",
      end: "2026-10-31T23:30:00.000Z",
      timeZone: DENVER,
    },
    createdAt: "2026-10-01T00:00:00.000Z",
  },
  {
    id: "507f1f77bcf86cd799439022",
    content: {
      kind: "details",
      title: "Record Compass demo",
      description: "",
    },
    schedule: {
      kind: "timed",
      start: "2026-10-31T21:30:00.000Z",
      end: "2026-10-31T23:00:00.000Z",
      timeZone: DENVER,
    },
    createdAt: "2026-10-01T00:00:00.000Z",
  },
  {
    id: "507f1f77bcf86cd799439023",
    content: { kind: "details", title: "Update 4e2d", description: "" },
    schedule: {
      kind: "timed",
      start: "2026-11-01T00:30:00.000Z",
      end: "2026-11-01T01:00:00.000Z",
      timeZone: DENVER,
    },
    createdAt: "2026-10-01T00:00:00.000Z",
  },
  {
    id: "507f1f77bcf86cd799439011",
    content: { kind: "details", title: "Unwind", description: "" },
    schedule: {
      kind: "timed",
      start: "2026-11-01T01:00:00.000Z",
      end: "2026-11-01T02:00:00.000Z",
      timeZone: DENVER,
    },
    recurrence: {
      kind: "occurrence",
      seriesId: "507f1f77bcf86cd799439099",
    },
    createdAt: "2026-10-01T00:00:00.000Z",
  },
  {
    id: "507f1f77bcf86cd799439012",
    content: { kind: "details", title: "Monthly Ritual", description: "" },
    schedule: {
      kind: "timed",
      start: "2026-11-01T01:30:00.000Z",
      end: "2026-10-31T19:00:00",
      timeZone: DENVER,
    },
    createdAt: "2026-10-01T00:00:00.000Z",
  },
];

test.describe("Tyler Oct 31 overlap column layout", () => {
  test.use({
    timezoneId: DENVER,
    viewport: { width: 1280, height: 800 },
  });

  test("fans overlapping Saturday events into side-by-side columns", async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(90_000);
    await page.addInitScript((timeZone) => {
      localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
      localStorage.setItem("compass.onboarding.first-event-done", "dismissed");
      localStorage.setItem("compass.view.sidebar-open", "false");
      localStorage.setItem("compass.defaultTimeZone", timeZone);
    }, DENVER);
    await page.clock.install({ time: new Date(FROZEN_CLOCK) });
    await prepareCalendarPage(page);
    await page.goto(`/week/${WEEK_START}`, { waitUntil: "domcontentloaded" });
    await page.locator("#mainGrid").waitFor({ state: "visible" });

    await seedLocalEvents(page, tylerSaturdayEvents());
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#mainGrid").waitFor({ state: "visible" });

    const unwind = page.getByRole("button", { name: /unwind/i });
    const ritual = page.getByRole("button", { name: /monthly ritual/i });
    await expect(unwind).toBeVisible();
    await expect(ritual).toBeVisible();

    const unwindBox = await unwind.evaluate((node) => {
      const el = node as HTMLElement;
      return {
        left: parseFloat(el.style.left),
        width: parseFloat(el.style.width),
      };
    });
    const ritualBox = await ritual.evaluate((node) => {
      const el = node as HTMLElement;
      return {
        left: parseFloat(el.style.left),
        width: parseFloat(el.style.width),
      };
    });

    expect(unwindBox.width).toBeCloseTo(ritualBox.width, 0);
    expect(Math.abs(unwindBox.left - ritualBox.left)).toBeCloseTo(
      unwindBox.width,
      0,
    );

    await page.locator("#mainGrid").screenshot({
      path: testInfo.outputPath("after-sat-oct31-column.png"),
    });
  });
});
