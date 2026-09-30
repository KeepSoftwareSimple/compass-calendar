import { expect, type Page, test } from "@playwright/test";
import {
  createEventTitle,
  dispatchDocumentKey,
  expectTimedEventVisible,
  fillTitleAndSaveEventForm,
  getVisibleDayDates,
  openTimedEventFormWithKeyboard,
  prepareCalendarPage,
} from "../utils/event-test-utils";

const getFormTitleInput = (page: Page) =>
  page.getByRole("form").getByPlaceholder("Title");

const pointerHint = (page: Page) => page.locator("[data-pointer-hint]");

const dispatchGridWheel = async (page: Page, deltaY: number) => {
  await page.evaluate((scrollDelta) => {
    const grid = document.getElementById("mainGrid");
    if (!grid) throw new Error("mainGrid missing");
    grid.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: scrollDelta,
        deltaX: 0,
        bubbles: true,
      }),
    );
  }, deltaY);
};

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

test("a card click shows the open hint and Enter opens the event", async ({
  page,
}) => {
  await prepareCalendarPage(page);

  const title = createEventTitle("Card Teach");
  await openTimedEventFormWithKeyboard(page);
  await fillTitleAndSaveEventForm(page, title);
  await expectTimedEventVisible(page, title);

  const eventButton = page
    .locator("#mainGrid")
    .getByRole("button", { name: title });
  await eventButton.scrollIntoViewIfNeeded();
  await eventButton.click({ force: true });

  await expect(pointerHint(page)).toContainText(/Press/i);
  await expect(pointerHint(page)).toContainText(/open/i);

  await page.keyboard.press("Enter");
  await expect(getFormTitleInput(page)).toHaveValue(title);
});

test("a slot click shows typed-time digits and C opens a timed draft", async ({
  page,
}) => {
  await prepareCalendarPage(page);

  const grid = page.locator("#mainGrid");
  const box = await grid.boundingBox();
  if (!box) throw new Error("timed grid is not visible");

  await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.35);

  const hint = pointerHint(page);
  await expect(hint).toContainText(/Type/i);
  await expect(hint).toContainText(/\d{3,4}/);

  await dispatchDocumentKey(page, "c");
  await expect(getFormTitleInput(page)).toBeVisible({ timeout: 10000 });
});

test("three wheel gestures on the grid show the scroll hint", async ({
  page,
}) => {
  await prepareCalendarPage(page);

  for (let i = 0; i < 2; i += 1) {
    await dispatchGridWheel(page, 48);
    await page.waitForTimeout(200);
  }
  await expect(pointerHint(page)).toHaveCount(0);

  await dispatchGridWheel(page, 48);
  await expect(pointerHint(page)).toContainText(/scroll/i);
});

test("clicking the next-week arrow navigates and shows Next time, press K", async ({
  page,
}) => {
  await prepareCalendarPage(page);
  const before = await getVisibleDayDates(page);

  await page.getByRole("button", { name: "Next week" }).click();

  await expect.poll(async () => getVisibleDayDates(page)).not.toEqual(before);
  await expect(pointerHint(page)).toContainText("Next time, press");
});

test("tips-muted suppresses pointer hints on card click", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("compass.shortcuts.tips-muted", "true");
  });
  await prepareCalendarPage(page);

  const title = createEventTitle("Muted Hint");
  await openTimedEventFormWithKeyboard(page);
  await fillTitleAndSaveEventForm(page, title);
  await expectTimedEventVisible(page, title);

  const eventButton = page
    .locator("#mainGrid")
    .getByRole("button", { name: title });
  await eventButton.click({ force: true });
  await expect(page.locator("[data-pointer-hint]")).toHaveCount(0);
});

test("a used edit-open shortcut retires the card-click pill", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "compass.shortcuts.personalization",
      JSON.stringify({
        version: 2,
        actions: {},
        shortcuts: {
          "edit-open": { invocations: 1, recentImpressions: 0 },
        },
      }),
    );
  });
  await prepareCalendarPage(page);

  const title = createEventTitle("Retired Hint");
  await openTimedEventFormWithKeyboard(page);
  await fillTitleAndSaveEventForm(page, title);
  await expectTimedEventVisible(page, title);

  const eventButton = page
    .locator("#mainGrid")
    .getByRole("button", { name: title });
  await eventButton.click({ force: true });
  await expect(page.locator("[data-pointer-hint]")).toHaveCount(0);
});

test("right-click Hide shows the keyboard-only toast and does not hide", async ({
  page,
}) => {
  await prepareCalendarPage(page);

  const title = createEventTitle("Hide Toast");
  await openTimedEventFormWithKeyboard(page);
  await fillTitleAndSaveEventForm(page, title);
  await expectTimedEventVisible(page, title);

  const eventButton = page
    .locator("#mainGrid")
    .getByRole("button", { name: title })
    .first();
  await eventButton.click({ button: "right" });

  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Hide event", exact: true }).click();

  await expect(
    page.getByText(/Keyboard only, press/i).filter({ hasText: /hide event/i }),
  ).toBeVisible();
  await expect(
    page.locator("#mainGrid").getByRole("button", { name: title }).first(),
  ).toBeVisible();
});
