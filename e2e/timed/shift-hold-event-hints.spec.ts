import { expect, test } from "@playwright/test";
import {
  createEventTitle,
  expectTimedEventVisible,
  fillTitleAndSaveEventForm,
  getSavedEventsByTitle,
  getVisibleDayDates,
  openTimedEventFormWithKeyboard,
  prepareTimedCalendarPage,
  pressShortcut,
} from "../utils/event-test-utils";

type CalendarPage = Parameters<typeof prepareTimedCalendarPage>[0];

const DAY_PREFIX_KEYS: Record<string, string[]> = {
  su: ["s", "u"],
  m: ["m"],
  t: ["t"],
  w: ["w"],
  r: ["r"],
  f: ["f"],
  sa: ["s", "a"],
};

const WEEKDAY_PREFIXES = ["su", "m", "t", "w", "r", "f", "sa"];

/**
 * Creates a timed event on today via `c`, then nudges it by quarter-hour
 * steps so the trio gets distinct start times for chronological jump
 * indices. Direction flips near midnight so a nudge never leaves the day.
 */
const createTimedEventOffsetBy = async (
  page: CalendarPage,
  title: string,
  quarterHours: number,
) => {
  await openTimedEventFormWithKeyboard(page);
  await fillTitleAndSaveEventForm(page, title);
  await expectTimedEventVisible(page, title);
  if (quarterHours === 0) return;

  const [saved] = await getSavedEventsByTitle(page, title);
  const startHour = new Date(saved.startDate).getHours();
  const key = startHour >= 22 ? "Shift+ArrowUp" : "Shift+ArrowDown";

  const eventButton = page
    .locator("#mainGrid")
    .getByRole("button", { name: title });
  await eventButton.focus();
  for (let press = 0; press < quarterHours; press++) {
    await page.keyboard.press(key);
    const direction = key === "Shift+ArrowUp" ? -1 : 1;
    const expectedStart =
      new Date(saved.startDate).getTime() +
      direction * (press + 1) * 15 * 60_000;
    await expect
      .poll(async () => {
        const [event] = await getSavedEventsByTitle(page, title);
        return new Date(event.startDate).getTime();
      })
      .toBe(expectedStart);
  }
};

const shiftHintOverlay = (page: CalendarPage) =>
  page.locator("[data-shift-event-hints]");

const blurActive = (page: CalendarPage) =>
  page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });

test("tap f shows day-prefix jump keys and focuses the assigned event", async ({
  page,
}) => {
  await prepareTimedCalendarPage(page);

  const earlyTitle = createEventTitle("Early Flash");
  const middleTitle = createEventTitle("Middle Flash");
  const lateTitle = createEventTitle("Late Flash");

  // Same day; nudges give distinct start times for chronological indices.
  await createTimedEventOffsetBy(page, earlyTitle, 0);
  await createTimedEventOffsetBy(page, middleTitle, 1);
  await createTimedEventOffsetBy(page, lateTitle, 2);

  // Indices are chronological; the direction near midnight flips which title
  // sits second, so resolve index 2's title from the stored start times.
  const events = await Promise.all(
    [earlyTitle, middleTitle, lateTitle].map(async (title) => {
      const [event] = await getSavedEventsByTitle(page, title);
      return { title, start: event.startDate };
    }),
  );
  const secondTitle = events.sort((a, b) => a.start.localeCompare(b.start))[1]
    .title;
  const secondButton = page
    .locator("#mainGrid")
    .getByRole("button", { name: secondTitle });

  await blurActive(page);
  await page.keyboard.press("f");

  const overlay = shiftHintOverlay(page);
  await expect(overlay.locator(":scope > span")).toHaveCount(3);

  const labels = await overlay.evaluate((root) =>
    [...root.querySelectorAll(":scope > span")].map(
      (node) => node.textContent?.trim() ?? "",
    ),
  );
  const dayPrefix = labels[0]?.replace(/\d+$/, "") ?? "";
  expect(DAY_PREFIX_KEYS[dayPrefix]).toBeTruthy();
  expect([...labels].sort()).toEqual(
    [`${dayPrefix}1`, `${dayPrefix}2`, `${dayPrefix}3`].sort(),
  );

  for (const key of DAY_PREFIX_KEYS[dayPrefix] ?? []) {
    await page.keyboard.down(key);
    await page.keyboard.up(key);
  }
  await page.keyboard.down("2");
  await page.keyboard.up("2");

  await page.clock.fastForward(500);

  await expect(secondButton).toBeFocused();
  // Mode stays on after a digit focus so another index can be typed.
  await expect(shiftHintOverlay(page)).toHaveCount(1);

  await page.keyboard.down("Escape");
  await page.keyboard.up("Escape");
  await expect(shiftHintOverlay(page)).toHaveCount(0);
});

test("Shift and the day letter focuses an event without first pressing f", async ({
  page,
}) => {
  await prepareTimedCalendarPage(page);

  const title = createEventTitle("Leaderless Jump");
  await createTimedEventOffsetBy(page, title, 0);
  await blurActive(page);

  const [saved] = await getSavedEventsByTitle(page, title);
  const weekday = new Date(saved.startDate).getDay();
  const keys = DAY_PREFIX_KEYS[WEEKDAY_PREFIXES[weekday]!]!;

  // Shift enters the column from idle; the weekend's second letter is typed
  // bare, because jump mode is already on by then.
  await page.keyboard.press(`Shift+${keys[0]}`);
  if (keys[1]) await page.keyboard.press(keys[1]);

  await expect(
    page.locator("#mainGrid").getByRole("button", { name: title }),
  ).toBeFocused();
  await expect(shiftHintOverlay(page)).toHaveCount(1);
});

test("Shift and a day letter then c creates on that column of another week", async ({
  page,
}) => {
  await prepareTimedCalendarPage(page);
  await blurActive(page);

  // Next window, so today is out of view and a create that ignored the
  // selection would fall back to the first visible day. Target the last
  // column: it is never that fallback, and it needs no events of its own to
  // be selectable.
  const thisWindow = await getVisibleDayDates(page);
  await page.keyboard.press("k");
  await expect.poll(() => getVisibleDayDates(page)).not.toEqual(thisWindow);
  const nextWindow = await getVisibleDayDates(page);
  const targetDate = nextWindow[nextWindow.length - 1]!;
  const weekday = new Date(`${targetDate}T12:00:00`).getDay();
  const keys = DAY_PREFIX_KEYS[WEEKDAY_PREFIXES[weekday]!]!;

  await page.keyboard.press(`Shift+${keys[0]}`);
  if (keys[1]) await page.keyboard.press(keys[1]);
  await page.keyboard.press("c");

  const title = createEventTitle("Column Create");
  await fillTitleAndSaveEventForm(page, title);

  const [saved] = await getSavedEventsByTitle(page, title);
  expect(new Date(saved.startDate).getDay()).toBe(weekday);
  // Creating spends the selection, so no chips linger over the new event.
  await expect(shiftHintOverlay(page)).toHaveCount(0);
});

test("Shift+Tab does not toggle event jump keys", async ({ page }) => {
  await prepareTimedCalendarPage(page);

  const title = createEventTitle("Chord Quiet");
  await createTimedEventOffsetBy(page, title, 0);
  await blurActive(page);

  await page.keyboard.down("Shift");
  await page.keyboard.press("Tab");
  await page.keyboard.up("Shift");

  await expect(shiftHintOverlay(page)).toHaveCount(0);
});

test("lowercase day prefix plus digit targets an event without a typed-time draft", async ({
  page,
}) => {
  await prepareTimedCalendarPage(page);
  await blurActive(page);
  await page.keyboard.press("Escape");
  await expect(shiftHintOverlay(page)).toHaveCount(0);

  const titles: string[] = [];
  for (let index = 0; index < 4; index++) {
    const title = createEventTitle(`Ordinal Jump ${index + 1}`);
    titles.push(title);
    await createTimedEventOffsetBy(page, title, index);
    await expectTimedEventVisible(page, title);
  }

  await blurActive(page);
  await page.keyboard.press("Escape");
  await pressShortcut(page, "f");

  const overlay = shiftHintOverlay(page);
  await expect(overlay.locator(":scope > span")).toHaveCount(4);

  const labels = await overlay.evaluate((root) =>
    [...root.querySelectorAll(":scope > span")].map(
      (node) => node.textContent?.trim() ?? "",
    ),
  );
  expect(labels.every((label) => label === label.toLowerCase())).toBe(true);

  const fourthLabel = labels.find((label) => label.endsWith("4")) ?? labels[3]!;
  const events = await Promise.all(
    titles.map(async (title) => {
      const [event] = await getSavedEventsByTitle(page, title);
      return { title, start: event.startDate };
    }),
  );
  const fourthTitle = events.sort((a, b) => a.start.localeCompare(b.start))[3]!
    .title;
  const fourthButton = page
    .locator("#mainGrid")
    .getByRole("button", { name: fourthTitle });

  await page.locator("#mainGrid").focus();
  for (const char of fourthLabel) {
    await pressShortcut(page, char);
  }
  // prepareTimedCalendarPage pins the browser clock; jump focus commits on a
  // real setTimeout(DIGIT_AMBIGUOUS_COMMIT_MS).
  await page.clock.fastForward(500);

  await expect(fourthButton).toBeFocused({ timeout: 5000 });
});

test("fast Shift+J does not toggle event jump keys", async ({ page }) => {
  await prepareTimedCalendarPage(page);

  const title = createEventTitle("Chord Quiet J");
  await createTimedEventOffsetBy(page, title, 0);
  await blurActive(page);

  await page.keyboard.down("Shift");
  await page.keyboard.down("j");
  await page.clock.runFor(250);
  await page.keyboard.up("j");
  await page.keyboard.up("Shift");

  await expect(shiftHintOverlay(page)).toHaveCount(0);
});
