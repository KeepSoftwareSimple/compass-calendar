import { expect, test } from "@playwright/test";
import {
  getVisibleDayDates,
  prepareCalendarPage,
} from "../utils/event-test-utils";
import { seedLocalEvents } from "../utils/local-event-seed.util";

const DENVER = "America/Denver";
const WEEK_START = "2026-11-01";
/** Outside the Nov 1–7 view so no column is "today" and the now line stays hidden. */
const FROZEN_CLOCK = "2026-10-20T12:00:00-06:00";

type SeededEvent = {
  id: string;
  title: string;
  startUtc: string;
  endUtc: string;
};

function tylerWeekEvents(): SeededEvent[] {
  const events: SeededEvent[] = [];
  for (let day = 1; day <= 7; day += 1) {
    const dayKey = `2026-11-${String(day).padStart(2, "0")}`;
    const dayId = String(day).padStart(2, "0");
    events.push({
      id: `${dayId}${"a".repeat(22)}`,
      title: "~ Wake",
      startUtc: `${dayKey}T11:00:00.000Z`,
      endUtc: `${dayKey}T12:00:00.000Z`,
    });
    events.push({
      id: `${dayId}${"c".repeat(22)}`,
      title: "~ Devotion",
      startUtc: `${dayKey}T13:00:00.000Z`,
      endUtc: `${dayKey}T14:00:00.000Z`,
    });
  }
  return events;
}

async function seedTylerWeek(page: import("@playwright/test").Page) {
  await seedLocalEvents(
    page,
    tylerWeekEvents().map(({ id, title, startUtc, endUtc }) => ({
      id,
      content: { kind: "details", title, description: "" },
      schedule: {
        kind: "timed",
        start: startUtc,
        end: endUtc,
        timeZone: DENVER,
      },
      createdAt: "2026-11-01T00:00:00.000Z",
    })),
  );
}

function alignmentPayload() {
  const grid = document.querySelector("#mainGrid");
  if (!grid) {
    return { ok: false, reason: "missing grid" };
  }
  const tolerance = 4;
  const timeColumn = grid.querySelector(
    ':scope > div[aria-hidden="true"].absolute',
  );
  if (!timeColumn) {
    return { ok: false, reason: "missing time column" };
  }
  const rows = [
    ...grid.querySelectorAll<HTMLElement>(
      '[data-calendar-timed-grid-row="true"]',
    ),
  ];
  // Wall-clock 4 AM / 6 AM use rows 3 and 5 from the 1 AM origin (see
  // denver-grid-alignment.test.ts). Compare cards to row bands, not label text,
  // because fall-back Sunday gutter copy can disagree with wall clock.
  const fourAmTop = rows[3]?.getBoundingClientRect().top ?? null;
  const sixAmTop = rows[5]?.getBoundingClientRect().top ?? null;

  const layers = document.querySelector("#timedEvents");
  if (!layers) {
    return { ok: false, reason: "missing timedEvents" };
  }

  const cardsFor = (pattern: RegExp) =>
    [...layers.querySelectorAll<HTMLElement>("[style*='top']")].filter((node) =>
      pattern.test(node.textContent ?? ""),
    );

  const wakeCards = cardsFor(/wake/i);
  const devotionCards = cardsFor(/devotion/i);
  if (wakeCards.length !== 7 || devotionCards.length !== 7) {
    return {
      ok: false,
      reason: `expected 7 wake and 7 devotion, got ${wakeCards.length} and ${devotionCards.length}`,
    };
  }

  if (fourAmTop === null || sixAmTop === null) {
    return {
      ok: false,
      reason: "missing 4 AM or 6 AM timed row band",
    };
  }

  const wakeDeltas = wakeCards.map(
    (node) => node.getBoundingClientRect().top - fourAmTop,
  );
  const devotionDeltas = devotionCards.map(
    (node) => node.getBoundingClientRect().top - sixAmTop,
  );
  const misaligned = [...wakeDeltas, ...devotionDeltas].filter(
    (delta) => Math.abs(delta) > tolerance,
  );

  const nowLines = grid.querySelectorAll(".c-now-line-rim");
  return {
    ok: misaligned.length === 0 && nowLines.length === 0,
    wakeDeltas,
    devotionDeltas,
    nowLineCount: nowLines.length,
  };
}

test.describe("Denver browser fall-back week", () => {
  test.use({
    timezoneId: DENVER,
    viewport: { width: 1280, height: 800 },
  });

  test("renders the Nov 2026 fall-back week aligned with gutter labels", async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(90_000);
    await page.addInitScript(() => {
      localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
      localStorage.setItem("compass.onboarding.first-event-done", "dismissed");
      localStorage.setItem("compass.view.sidebar-open", "false");
    });
    await page.clock.install({ time: new Date(FROZEN_CLOCK) });
    await prepareCalendarPage(page);
    await page.goto(`/week/${WEEK_START}`, { waitUntil: "domcontentloaded" });
    await page.locator("#mainGrid").waitFor({ state: "visible" });

    await expect.poll(() => getVisibleDayDates(page)).toContain(WEEK_START);

    await seedTylerWeek(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#mainGrid").waitFor({ state: "visible" });

    await expect(
      page.locator("#timedEvents").getByRole("button", { name: /Wake/i }),
    ).toHaveCount(7);
    await expect(
      page.locator("#timedEvents").getByRole("button", { name: /Devotion/i }),
    ).toHaveCount(7);

    await page.locator("#mainGrid").evaluate((grid) => {
      grid.scrollTop = 0;
    });

    const alignment = await page.evaluate(alignmentPayload);
    expect(alignment.ok, JSON.stringify(alignment)).toBe(true);

    await page.locator("#mainSection").screenshot({
      path: test.info().outputPath("dst-nov-week-full.png"),
    });

    const slots = await page
      .locator("#mainGrid")
      .evaluate((grid) =>
        getComputedStyle(grid)
          .getPropertyValue("--calendar-day-hour-slots")
          .trim(),
      );
    expect(slots).toBe("25");
    await expect(
      page.getByRole("button", { name: "Calendar timezone" }),
    ).toContainText("MST");
  });
});
