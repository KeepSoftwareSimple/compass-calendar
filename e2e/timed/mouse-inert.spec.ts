import { expect, test } from "@playwright/test";
import {
  createEventTitle,
  expectTimedEventVisible,
  fillTitleAndSaveEventForm,
  openTimedEventFormWithKeyboard,
  prepareCalendarPage,
} from "../utils/event-test-utils";

const getFormTitleInput = (page: import("@playwright/test").Page) =>
  page.getByRole("form").getByRole("textbox", { name: "Title" });

test("event form has no field-level copy buttons", async ({ page }) => {
  await prepareCalendarPage(page);
  await openTimedEventFormWithKeyboard(page);

  await expect(getFormTitleInput(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "copy event" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "copy event title" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "copy event location" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "copy event description" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "copy attendee list" }),
  ).toHaveCount(0);
});

test("text can be selected in the event title field", async ({ page }) => {
  await prepareCalendarPage(page);
  await openTimedEventFormWithKeyboard(page);

  const titleField = getFormTitleInput(page);
  await titleField.fill("Selectable title");
  await titleField.selectText();

  const selected = await titleField.evaluate(
    (el) =>
      (el as HTMLInputElement).selectionStart !==
      (el as HTMLInputElement).selectionEnd,
  );
  expect(selected).toBe(true);
});

test("the first click on an event teaches its jump key and Enter opens it", async ({
  page,
}) => {
  await prepareCalendarPage(page);

  const title = createEventTitle("Teach On Click");
  await openTimedEventFormWithKeyboard(page);
  await fillTitleAndSaveEventForm(page, title);
  await expectTimedEventVisible(page, title);

  const eventButton = page
    .locator("#mainGrid")
    .getByRole("button", { name: title });

  await eventButton.click({ force: true });
  const hint = page.locator("[data-pointer-hint]");
  await expect(hint).toContainText("then Enter to open this event");

  // The click focused the event, so the taught Enter works right away.
  await page.keyboard.press("Enter");
  await expect(getFormTitleInput(page)).toHaveValue(title);
});

test("an empty grid click teaches the digits that create there", async ({
  page,
}) => {
  await prepareCalendarPage(page);

  const grid = page.locator("#mainGrid");
  const box = await grid.boundingBox();
  if (!box) throw new Error("timed grid is not visible");
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.5);

  const hint = page.locator("[data-pointer-hint]");
  await expect(hint).toContainText("to create an event at");
  const digits = await hint.locator("kbd").first().innerText();
  expect(digits).toMatch(/^\d{3,4}$/);
  const timeLabel = (await hint.innerText()).match(/at (.+?)\.\s*$/)?.[1];
  expect(timeLabel).toBeTruthy();
  // "7:15 AM" -> "7:15"; the draft's name reads "Untitled event, 7:15 - 8:15 AM".
  const startClock = (timeLabel ?? "").replace(/\s*[AP]M$/i, "");
  // The hint always spells the minutes (Intl `minute: "2-digit"`), while the
  // card's label drops them on a whole hour (web.date.util's getTimeLabel
  // strips ":00"), so "2:00 PM" in the hint is "2 - 3 PM" on the card. Accept
  // either spelling: without this the test passes all day and fails only in
  // the windows where the clicked slot lands exactly on the hour.
  const startPattern = startClock.replace(/:00$/, "(?::00)?");

  // Typed time places a draft at the clicked slot; the form opens on Enter.
  await page.keyboard.type(digits);
  await expect(
    grid.getByRole("button", {
      name: new RegExp(`Untitled event, ${startPattern} `),
    }),
  ).toBeVisible();
});

test("keyboard activation of native buttons still works", async ({ page }) => {
  await prepareCalendarPage(page);

  const timezoneButton = page.getByRole("button", {
    name: /Calendar timezone/,
  });
  await timezoneButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("combobox")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("combobox")).toHaveCount(0);
});
