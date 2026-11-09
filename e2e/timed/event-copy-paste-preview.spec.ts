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

test("Mod+V after Shift day column lands the duplicate on that day", async ({
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

  await pressShortcut(page, "c", { ctrlKey: true });
  await expect(page.locator("[data-event-paste-preview]")).toHaveCount(1);
  // Pinned clock is Friday 2026-04-24; Shift+W selects Wednesday 2026-04-22.
  await pressShortcut(page, "w", { shiftKey: true });
  await pressShortcut(page, "v", { ctrlKey: true });

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
  await pressShortcut(page, "c", { ctrlKey: true });
  await expect(page.locator("[data-event-paste-preview]")).toHaveCount(1);

  await pressShortcut(page, "v", { ctrlKey: true });
  await expect(page.locator("[data-event-paste-preview]")).toHaveCount(0);
  await expect
    .poll(async () => (await getSavedEventsByTitle(page, title)).length)
    .toBe(2);
});
