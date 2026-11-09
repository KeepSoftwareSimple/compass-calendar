import { expect, test } from "@playwright/test";
import {
  createEventTitle,
  fillTitleAndSaveEventForm,
  getSavedEventsByTitle,
  openTimedEventFormWithKeyboard,
  prepareTimedCalendarPage,
  pressShortcut,
} from "../utils/event-test-utils";

test("Mod+C shows a paste preview ghost and Esc cancels without pasting", async ({
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
  await pressShortcut(page, "c", { ctrlKey: true });

  await expect(page.locator("[data-event-paste-preview]")).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(page.locator("[data-event-paste-preview]")).toHaveCount(0);
  await expect
    .poll(async () => (await getSavedEventsByTitle(page, title)).length)
    .toBe(1);
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
  await pressShortcut(page, "c", { ctrlKey: true });
  await expect(page.locator("[data-event-paste-preview]")).toHaveCount(1);

  await pressShortcut(page, "v", { ctrlKey: true });
  await expect(page.locator("[data-event-paste-preview]")).toHaveCount(0);
  await expect
    .poll(async () => (await getSavedEventsByTitle(page, title)).length)
    .toBe(2);
});
