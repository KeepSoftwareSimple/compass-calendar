import { expect, type Page, test } from "@playwright/test";
import {
  createEventTitle,
  deleteEventWithKeyboard,
  fillTitleAndSaveEventForm,
  getSavedEventsByTitle,
  openAllDayEventFormWithKeyboard,
  openEventForEditingWithKeyboard,
  prepareTimedCalendarPage,
} from "../utils/event-test-utils";

// Mirrors apps/calendar-web/src/grid/utils/allDayRowHeight.util.ts.
const ALL_DAY_ROW_SPARE_LANE_PX = 23;
const EVENT_ALLDAY_GAP = 3;
const EVENT_ALLDAY_ROW_HEIGHT = 23;
const ALL_DAY_ROW_VISIBLE_LANES_COLLAPSED = 2;

/** Event lanes plus one slim clickable lane; an empty row is just that lane. */
const allDayRowHeightPx = (laneCount: number) =>
  2 * EVENT_ALLDAY_GAP +
  laneCount * EVENT_ALLDAY_ROW_HEIGHT +
  ALL_DAY_ROW_SPARE_LANE_PX;

/** Two event lanes plus the "+N more" lane. */
const COLLAPSED_HEIGHT_PX = allDayRowHeightPx(
  ALL_DAY_ROW_VISIBLE_LANES_COLLAPSED,
);

const prepareTeachingWeek = async (page: Page) => {
  await page.addInitScript(() => {
    localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
    localStorage.setItem(
      "compass.onboarding.has-seen-shortcut-showcase",
      "true",
    );
    localStorage.setItem("compass.onboarding.first-event-done", "dismissed");
  });
  await prepareTimedCalendarPage(page);
};

const readAllDayRowHeight = (page: Page) =>
  page.evaluate(() =>
    Math.round(
      document.getElementById("allDayRow")?.getBoundingClientRect().height ?? 0,
    ),
  );

const focusGrid = async (page: Page) => {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await page.locator("#mainGrid").focus();
};

const pointerHint = (page: Page) => page.locator("[data-pointer-hint]");

const createAllDayEvents = async (page: Page, count: number) => {
  const titles: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const title = createEventTitle(`AllDay ${i + 1}`);
    await openAllDayEventFormWithKeyboard(page);
    await fillTitleAndSaveEventForm(page, title);
    titles.push(title);
  }
  return titles;
};

test("an empty all-day row keeps only one slim clickable lane", async ({
  page,
}) => {
  await prepareTeachingWeek(page);

  await expect.poll(() => readAllDayRowHeight(page)).toBe(allDayRowHeightPx(0));
  await expect(page.locator("#allday-row-toggle")).toHaveCount(0);
});

test("all-day row height tracks stacked events in compact mode", async ({
  page,
}) => {
  await prepareTeachingWeek(page);

  const titles = await createAllDayEvents(page, 3);

  const threeLaneHeight = allDayRowHeightPx(3);
  await expect.poll(() => readAllDayRowHeight(page)).toBe(threeLaneHeight);
  await expect(page.locator("#allday-row-toggle")).toHaveCount(0);

  await openEventForEditingWithKeyboard(page, titles[2]!);
  await deleteEventWithKeyboard(page);

  const twoLaneHeight = allDayRowHeightPx(2);
  await expect.poll(() => readAllDayRowHeight(page)).toBe(twoLaneHeight);
  expect(twoLaneHeight).toBeLessThan(threeLaneHeight);
});

test("a busy all-day row collapses and Shift+A toggles it across reloads", async ({
  page,
}) => {
  await prepareTeachingWeek(page);
  await createAllDayEvents(page, 5);

  const row = page.locator("#allDayRow");
  const toggle = page.locator("#allday-row-toggle");
  const expandedHeight = allDayRowHeightPx(5);

  // Focus inside the row peeks it open; move focus back to the grid.
  await focusGrid(page);
  // Collapsed by default: two lanes plus "+3 more".
  await expect.poll(() => readAllDayRowHeight(page)).toBe(COLLAPSED_HEIGHT_PX);
  await expect(row).toHaveAttribute("data-allday-collapsed", "true");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("allday-row-more").first()).toContainText(
    "+3 more",
  );

  await page.keyboard.press("Shift+A");
  await expect.poll(() => readAllDayRowHeight(page)).toBe(expandedHeight);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("allday-row-more")).toHaveCount(0);

  // The choice survives a reload.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#mainGrid").waitFor({ state: "visible" });
  await expect.poll(() => readAllDayRowHeight(page)).toBe(expandedHeight);

  await focusGrid(page);
  await page.keyboard.press("Shift+A");
  await expect.poll(() => readAllDayRowHeight(page)).toBe(COLLAPSED_HEIGHT_PX);

  // The gutter toggle and "+N more" also expand it.
  await page.getByRole("button", { name: "+3 more" }).first().click();
  await expect.poll(() => readAllDayRowHeight(page)).toBe(expandedHeight);
  await toggle.click();
  await expect.poll(() => readAllDayRowHeight(page)).toBe(COLLAPSED_HEIGHT_PX);
});

test("Shift+W then Shift+C creates an all-day event on Wednesday without the mouse", async ({
  page,
}) => {
  await prepareTeachingWeek(page);
  const title = createEventTitle("Keyboard AllDay");

  await focusGrid(page);
  // Deterministic clock is Friday 2026-04-24; Wednesday is 2026-04-22.
  await page.keyboard.press("Shift+W");
  await page.keyboard.press("Shift+C");
  await fillTitleAndSaveEventForm(page, title);

  await expect
    .poll(async () => (await getSavedEventsByTitle(page, title))[0]?.startDate)
    .toMatch(/^2026-04-22/);
});

test("empty all-day click teaches picking the day, then Shift+C", async ({
  page,
}) => {
  await prepareTeachingWeek(page);

  await expect(page.locator("#allDayRow")).toHaveClass(/ph-no-rageclick/);

  const clickTarget = await page.evaluate(() => {
    const column = document.querySelector<HTMLElement>(
      '#allDayColumns [data-grid-date="2026-04-22"]',
    );
    if (!column) throw new Error("missing Wednesday all-day column");
    const box = column.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  });

  await page.mouse.click(clickTarget.x, clickTarget.y);

  const hint = pointerHint(page);
  await expect(hint).toBeVisible();
  await expect(hint).toContainText("to pick Wednesday");
  await expect(hint).toContainText("for an all-day event");
  await expect(hint.getByText("W", { exact: true })).toBeVisible();
  await expect(hint.getByText("C", { exact: true })).toBeVisible();
  await expect(hint.getByText("Shift", { exact: true }).first()).toBeVisible();
});
