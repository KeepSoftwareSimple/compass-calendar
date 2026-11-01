import { expect, test } from "@playwright/test";
import {
  createEventTitle,
  expectTimedEventVisible,
  fillTitleAndSaveEventForm,
  getSavedEventsByTitle,
  getVisibleDayDates,
  openAllDayEventFormWithKeyboard,
  openTimedEventFormWithKeyboard,
  prepareTimedCalendarPage,
} from "../utils/event-test-utils";

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

test("Shift+ArrowRight at the week edge carries the event into the next window", async ({
  page,
}) => {
  await prepareTimedCalendarPage(page);

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
  await prepareTimedCalendarPage(page);

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
});

test(". opens the focused event's menu without a mouse", async ({ page }) => {
  await prepareTimedCalendarPage(page);

  const title = createEventTitle("Menu By Key");
  await openTimedEventFormWithKeyboard(page);
  await fillTitleAndSaveEventForm(page, title);
  await expectTimedEventVisible(page, title);

  const eventButton = page
    .locator("#mainGrid")
    .getByRole("button", { name: title });
  await eventButton.focus();
  await page.keyboard.press(".");

  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem").first()).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});

test("ArrowDown opens the event-form date picker without a mouse", async ({
  page,
}) => {
  await prepareTimedCalendarPage(page);
  await openAllDayEventFormWithKeyboard(page);

  const startDate = page.locator('input[title="Pick Start Date"]');
  await startDate.focus();
  await page.keyboard.press("ArrowDown");

  const calendar = page.locator(".react-datepicker__month");
  await expect(calendar).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(calendar).toHaveCount(0);
  await expect(startDate).toBeFocused();
});

test("Enter and Space open the timed event-form date picker without a mouse", async ({
  page,
}, testInfo) => {
  await prepareTimedCalendarPage(page);
  await openTimedEventFormWithKeyboard(page);

  const startDate = page.locator('input[title="Pick Start Date"]');
  const calendar = page.locator(".react-datepicker__month");

  await startDate.focus();
  await page.keyboard.press("Enter");
  await expect(calendar).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(calendar).toHaveCount(0);
  await expect(startDate).toBeFocused();

  await page.keyboard.press("Space");
  await expect(calendar).toBeVisible();

  await page.screenshot({
    path: testInfo.outputPath("event-form-date-keyboard-open.png"),
    fullPage: true,
  });
});

test("typed date moves a timed event while keeping its duration", async ({
  page,
}) => {
  await prepareTimedCalendarPage(page);

  const visibleDays = await getVisibleDayDates(page);
  const typedDay = visibleDays[1] ?? visibleDays[0];
  const [, month, day] = typedDay.split("-").map(Number);

  const title = createEventTitle("Date Move");
  await openTimedEventFormWithKeyboard(page);

  const startDate = page.locator('input[title="Pick Start Date"]');
  await startDate.click();
  await startDate.fill(`${month}/${day}`);
  await page.keyboard.press("Enter");

  await fillTitleAndSaveEventForm(page, title);
  await expectTimedEventVisible(page, title);

  await expect
    .poll(async () => {
      const [event] = await getSavedEventsByTitle(page, title);
      return event?.startDate.slice(0, 10);
    })
    .toBe(typedDay);
});

test("all-day keyboard date entry keeps a valid end date", async ({ page }) => {
  await prepareTimedCalendarPage(page);
  await openAllDayEventFormWithKeyboard(page);

  const startDate = page.locator('input[title="Pick Start Date"]');
  await startDate.focus();
  await startDate.fill("10/12");
  await page.keyboard.press("Enter");

  const endDate = page.locator('input[title="Pick End Date"]');
  await endDate.focus();
  await endDate.fill("10/14");
  await page.keyboard.press("Enter");

  const title = createEventTitle("All-day span");
  await page.getByPlaceholder("Title").fill(title);
  await page.keyboard.press("ControlOrMeta+Enter");

  await expect(page.getByRole("form")).toHaveCount(0);
  // The datepicker keeps an empty announcement region mounted in the sidebar.
  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveCount(
    0,
  );
  await expect
    .poll(async () => {
      const [event] = await getSavedEventsByTitle(page, title);
      return (
        event && {
          start: event.startDate.slice(5, 10),
          end: event.endDate.slice(5, 10),
        }
      );
    })
    // All-day storage keeps the end exclusive, through October 14.
    .toEqual({ start: "10-12", end: "10-15" });
});
