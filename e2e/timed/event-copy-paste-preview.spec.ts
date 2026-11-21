import { expect, test } from "@playwright/test";
import {
  createEventTitle,
  fillTitleAndSaveEventForm,
  getSavedEventsByTitle,
  openTimedEventFormWithKeyboard,
  prepareTimedCalendarPage,
} from "../utils/event-test-utils";

test("Mod+C confirms the copy and Escape dismisses the paste hints", async ({
  page,
}) => {
  await prepareTimedCalendarPage(page);
  const title = createEventTitle("Copy Preview");
  await openTimedEventFormWithKeyboard(page);
  await fillTitleAndSaveEventForm(page, title);

  const eventButton = page
    .locator("#mainGrid")
    .getByRole("button", { name: title });
  await eventButton.focus();
  await page.keyboard.press("ControlOrMeta+c");

  await expect(
    page.getByText("Event copied to clipboard", { exact: true }),
  ).toBeVisible();
  await expect(eventButton).toBeFocused();
  await expect(eventButton).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(
    page.getByText("Event copied to clipboard", { exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(async () => (await getSavedEventsByTitle(page, title)).length)
    .toBe(1);
});

test("Mod+V after ArrowLeft lands the duplicate on the moved day", async ({
  page,
}) => {
  await prepareTimedCalendarPage(page);
  const title = createEventTitle("Copy Move Paste");
  await openTimedEventFormWithKeyboard(page);
  await fillTitleAndSaveEventForm(page, title);

  const eventButton = page
    .locator("#mainGrid")
    .getByRole("button", { name: title });
  await eventButton.focus();
  const [before] = await getSavedEventsByTitle(page, title);
  const sourceDay = before.startDate.slice(0, 10);

  await page.keyboard.press("ControlOrMeta+c");
  await expect(
    page.getByText("Event copied to clipboard", { exact: true }),
  ).toBeVisible();
  await expect(eventButton).toBeFocused();
  await expect(eventButton).toHaveCount(1);
  const destination = page.getByText(/^Paste to /);
  const initialDestination = await destination.textContent();
  await page.keyboard.press("ArrowLeft");
  await expect(destination).not.toHaveText(initialDestination!);
  await expect(eventButton).toBeFocused();
  await expect(eventButton).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+v");

  await expect
    .poll(async () => (await getSavedEventsByTitle(page, title)).length)
    .toBe(2);
  const saved = await getSavedEventsByTitle(page, title);
  const targetDays = [
    ...new Set(saved.map((row) => row.startDate.slice(0, 10))),
  ];
  expect(targetDays).toHaveLength(2);
  expect(targetDays).toContain(sourceDay);
  expect(targetDays.some((day) => day !== sourceDay)).toBe(true);
});

test("Mod+V pastes a duplicate without opening the form", async ({ page }) => {
  await prepareTimedCalendarPage(page);
  const title = createEventTitle("Copy Paste");
  await openTimedEventFormWithKeyboard(page);
  await fillTitleAndSaveEventForm(page, title);

  const eventButton = page
    .locator("#mainGrid")
    .getByRole("button", { name: title });
  await eventButton.focus();
  await page.keyboard.press("ControlOrMeta+c");
  await expect(
    page.getByText("Event copied to clipboard", { exact: true }),
  ).toBeVisible();
  await expect(eventButton).toBeFocused();
  await expect(eventButton).toHaveCount(1);

  await page.keyboard.press("ControlOrMeta+v");
  await expect(
    page.getByText("Event copied to clipboard", { exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(async () => (await getSavedEventsByTitle(page, title)).length)
    .toBe(2);
});
