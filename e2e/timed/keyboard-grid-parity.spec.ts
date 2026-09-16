import { expect, test } from "@playwright/test";
import {
  createEventTitle,
  expectTimedEventVisible,
  fillTitleAndSaveEventForm,
  getSavedEventsByTitle,
  getVisibleDayDates,
  openAllDayEventFormWithKeyboard,
  openTimedEventFormWithKeyboard,
  prepareCalendarPage,
} from "../utils/event-test-utils";

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

test("Shift+ArrowRight at the week edge carries the event into the next window", async ({
  page,
}) => {
  await prepareCalendarPage(page);

  const title = createEventTitle("Carry Across");
  await openTimedEventFormWithKeyboard(page);
  await fillTitleAndSaveEventForm(page, title);
  await expectTimedEventVisible(page, title);

  const [saved] = await getSavedEventsByTitle(page, title);
  const startDay = saved.startDate.slice(0, 10);
  const daysBefore = await getVisibleDayDates(page);
  const lastVisible = daysBefore[daysBefore.length - 1];

  const eventButton = page
    .locator("#mainGrid")
    .getByRole("button", { name: title });
  await eventButton.focus();

  // Walk the event to the last visible day, then one more press crosses the
  // window edge and the view slides to keep it on screen.
  let day = startDay;
  while (day !== lastVisible) {
    await page.keyboard.press("Shift+ArrowRight");
    day = addDays(day, 1);
    await expect
      .poll(async () => {
        const [event] = await getSavedEventsByTitle(page, title);
        return event?.startDate.slice(0, 10);
      })
      .toBe(day);
  }

  await page.keyboard.press("Shift+ArrowRight");
  const crossedDay = addDays(day, 1);
  await expect
    .poll(async () => {
      const [event] = await getSavedEventsByTitle(page, title);
      return event?.startDate.slice(0, 10);
    })
    .toBe(crossedDay);

  // The window slid by one day and the event is still on screen and focused.
  await expect.poll(() => getVisibleDayDates(page)).toContain(crossedDay);
  await expectTimedEventVisible(page, title);
  await expect(eventButton).toBeFocused();
});

test("Alt+Shift+ArrowRight carries the event a week into the next window", async ({
  page,
}) => {
  await prepareCalendarPage(page);

  const title = createEventTitle("Coarse Carry");
  await openTimedEventFormWithKeyboard(page);
  await fillTitleAndSaveEventForm(page, title);
  await expectTimedEventVisible(page, title);

  const [saved] = await getSavedEventsByTitle(page, title);
  const startDay = saved.startDate.slice(0, 10);

  const eventButton = page
    .locator("#mainGrid")
    .getByRole("button", { name: title });
  await eventButton.focus();

  await page.keyboard.press("Alt+Shift+ArrowRight");
  const crossedDay = addDays(startDay, 7);
  await expect
    .poll(async () => {
      const [event] = await getSavedEventsByTitle(page, title);
      return event?.startDate.slice(0, 10);
    })
    .toBe(crossedDay);

  await expect.poll(() => getVisibleDayDates(page)).toContain(crossedDay);
  await expectTimedEventVisible(page, title);
  await expect(eventButton).toBeFocused();
});

test("m opens the focused event's menu without a mouse", async ({ page }) => {
  await prepareCalendarPage(page);

  const title = createEventTitle("Menu By Key");
  await openTimedEventFormWithKeyboard(page);
  await fillTitleAndSaveEventForm(page, title);
  await expectTimedEventVisible(page, title);

  const eventButton = page
    .locator("#mainGrid")
    .getByRole("button", { name: title });
  await eventButton.focus();
  await page.keyboard.press("m");

  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem").first()).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});

test("ArrowDown opens the event-form date picker without a mouse", async ({
  page,
}) => {
  await prepareCalendarPage(page);
  await openAllDayEventFormWithKeyboard(page);

  const startDate = page.locator('input[title="Pick Start Date"]');
  await startDate.focus();
  await page.keyboard.press("ArrowDown");

  const calendar = page.locator(".react-datepicker__month");
  await expect(calendar).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(calendar).toHaveCount(0);
});
