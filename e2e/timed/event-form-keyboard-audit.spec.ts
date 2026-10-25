import { expect, test } from "@playwright/test";
import {
  openTimedEventFormWithKeyboard,
  prepareTimedCalendarPage,
} from "../utils/event-test-utils";

const getFormScrollLeft = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const form = document.querySelector('form[name="Event Form"]');
    const scroller = form?.querySelector(".overflow-y-auto");
    return scroller instanceof HTMLElement ? scroller.scrollLeft : 0;
  });

test.beforeEach(async ({ page }) => {
  await prepareTimedCalendarPage(page);
});

test("keyboard tab order: title, date, start time, end time, all day", async ({
  page,
}, testInfo) => {
  await openTimedEventFormWithKeyboard(page);

  const title = page.getByRole("form").getByPlaceholder("Title");
  const startDate = page.locator('input[title="Pick Start Date"]');
  const startTime = page.getByRole("combobox", { name: "Start time" });
  const endTime = page.getByRole("combobox", { name: "End time" });
  const allDay = page.getByRole("checkbox", { name: "All day?" });

  await title.focus();
  await page.keyboard.press("Tab");
  await expect(startDate).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(startTime).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(endTime).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(allDay).toBeFocused();

  await page.screenshot({
    path: testInfo.outputPath("event-form-tab-order.png"),
    fullPage: true,
  });
});

test("typed date formats commit on Enter and preserve clock times", async ({
  page,
}, testInfo) => {
  await openTimedEventFormWithKeyboard(page);

  const startDate = page.locator('input[title="Pick Start Date"]');
  const startTime = page.getByRole("combobox", { name: "Start time" });

  await startTime.focus();
  const startTimeBefore = await startTime.inputValue();

  await startDate.focus();
  await startDate.fill("17.10.26");
  await page.keyboard.press("Enter");
  await expect(startDate).toHaveValue("10.17.26");

  await expect(startTime).toHaveValue(startTimeBefore);

  await startDate.focus();
  await startDate.fill("2026-11-03");
  await page.keyboard.press("Enter");
  await expect(startDate).toHaveValue("11.03.26");

  await page.screenshot({
    path: testInfo.outputPath("event-form-date-formats.png"),
    fullPage: true,
  });
});

test("end time menu opens without shifting the form panel horizontally", async ({
  page,
}, testInfo) => {
  await openTimedEventFormWithKeyboard(page);

  const endTime = page.getByRole("combobox", { name: "End time" });
  const scrollBefore = await getFormScrollLeft(page);

  await endTime.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("listbox")).toBeVisible();

  const scrollAfter = await getFormScrollLeft(page);
  expect(scrollAfter).toBe(scrollBefore);

  await page.screenshot({
    path: testInfo.outputPath("event-form-end-time-menu.png"),
    fullPage: true,
  });

  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("date picker arrow keys move the highlight while the input stays focused", async ({
  page,
}, testInfo) => {
  await openTimedEventFormWithKeyboard(page);

  const form = page.getByRole("form");
  const startDate = page.locator('input[title="Pick Start Date"]');

  await startDate.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".react-datepicker")).toBeVisible();
  await expect(startDate).toBeFocused();

  await page.keyboard.press("ArrowDown");
  const highlighted = page.locator(".react-datepicker__day--keyboard-selected");
  await expect(highlighted).toBeVisible();

  await page.screenshot({
    path: test.info().outputPath("event-form-date-picker-arrow-highlight.png"),
  });
  await page.screenshot({
    path: testInfo.outputPath("event-form-date-picker-arrow-highlight.png"),
  });

  await page.keyboard.press("Enter");
  await expect(page.locator(".react-datepicker")).toHaveCount(0);
  await expect(form).toBeVisible();
});

test("plain Enter in schedule fields does not submit; Mod+Enter does", async ({
  page,
}) => {
  await openTimedEventFormWithKeyboard(page);

  const title = page.getByRole("form").getByPlaceholder("Title");
  const startDate = page.locator('input[title="Pick Start Date"]');
  const location = page.getByRole("textbox", { name: "Location" });

  await title.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("form")).toBeVisible();

  await startDate.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("form")).toBeVisible();

  await location.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("form")).toBeVisible();

  const modEnter =
    process.platform === "darwin" ? "Meta+Enter" : "Control+Enter";
  await title.focus();
  await page.keyboard.press(modEnter);
  await expect(page.getByRole("form")).toHaveCount(0);
});
