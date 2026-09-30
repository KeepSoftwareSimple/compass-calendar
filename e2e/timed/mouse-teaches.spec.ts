import { expect, test } from "@playwright/test";
import {
  createEventTitle,
  dispatchDocumentKey,
  expectTimedEventVisible,
  fillTitleAndSaveEventForm,
  openTimedEventFormWithKeyboard,
  prepareCalendarPage,
} from "../utils/event-test-utils";

const getFormTitleInput = (page: import("@playwright/test").Page) =>
  page.getByRole("form").getByRole("textbox", { name: "Title" });

const prepareTeachingWeek = async (page: import("@playwright/test").Page) => {
  await page.addInitScript(() => {
    localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
    localStorage.setItem(
      "compass.onboarding.has-seen-shortcut-showcase",
      "true",
    );
    localStorage.setItem("compass.onboarding.first-event-done", "dismissed");
  });
  await prepareCalendarPage(page);
};

const pointerHint = (page: import("@playwright/test").Page) =>
  page.locator("[data-pointer-hint]");

test("event form has no field-level copy buttons", async ({ page }) => {
  await prepareTeachingWeek(page);
  await openTimedEventFormWithKeyboard(page);

  await expect(getFormTitleInput(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "copy event" })).toHaveCount(0);
});

test("text can be selected in the event title field", async ({ page }) => {
  await prepareTeachingWeek(page);
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

test("a card click teaches Enter and Enter opens the event", async ({
  page,
}) => {
  await prepareTeachingWeek(page);

  const title = createEventTitle("Pointer Card");
  await openTimedEventFormWithKeyboard(page);
  await fillTitleAndSaveEventForm(page, title);
  await expectTimedEventVisible(page, title);

  const eventButton = page
    .locator("#mainGrid")
    .getByRole("button", { name: title });
  await eventButton.scrollIntoViewIfNeeded();
  await eventButton.click({ force: true });

  const hint = pointerHint(page);
  await expect(hint).toBeVisible();
  await expect(hint).toContainText("Press");
  await expect(hint.getByText("Enter", { exact: true })).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(getFormTitleInput(page)).toHaveValue(title);
});

test("a slot click teaches typed time digits and typing opens create", async ({
  page,
}) => {
  await prepareTeachingWeek(page);

  const column = page.locator("#timedColumns").locator(":scope > *").first();
  await column.scrollIntoViewIfNeeded();
  const box = await column.boundingBox();
  if (!box) throw new Error("timed column is not visible");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.45);

  const hint = pointerHint(page);
  await expect(hint).toBeVisible();
  await expect(hint).toContainText("Type");

  const digitText = await hint.evaluate((el) => {
    const fromCopy = (el.textContent ?? "").match(/\d{3,4}/)?.[0] ?? "";
    if (fromCopy) return fromCopy;
    const chips = [...el.querySelectorAll("[aria-hidden]")]
      .map((node) => node.textContent?.trim() ?? "")
      .filter((text) => /^\d$/.test(text));
    return chips.join("");
  });
  expect(digitText.length).toBeGreaterThanOrEqual(3);

  for (const digit of digitText) {
    await dispatchDocumentKey(page, digit);
  }

  await expect(
    page
      .locator("#mainGrid")
      .getByRole("button", { name: /Untitled event/i })
      .first(),
  ).toBeVisible({ timeout: 10000 });
});

test("three wheel gestures teach scroll shortcuts", async ({ page }) => {
  await prepareTeachingWeek(page);

  await page.evaluate(async () => {
    const grid = document.getElementById("mainGrid");
    if (!grid) throw new Error("missing grid");
    for (let i = 0; i < 3; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 220));
      grid.dispatchEvent(
        new WheelEvent("wheel", {
          deltaY: 80,
          deltaX: 0,
          bubbles: true,
          cancelable: true,
        }),
      );
    }
  });

  const hint = pointerHint(page);
  await expect(hint).toBeVisible();
  await expect(hint).toContainText("scroll");
});

test("a header next-week click teaches K", async ({ page }) => {
  await prepareTeachingWeek(page);

  await page.getByRole("button", { name: "Next week" }).click();

  const hint = pointerHint(page);
  await expect(hint).toContainText("Next time, press");
  await expect(hint.getByText("K", { exact: true })).toBeVisible();
});

test("tips-muted suppresses pointer pills", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
    localStorage.setItem(
      "compass.onboarding.has-seen-shortcut-showcase",
      "true",
    );
    localStorage.setItem("compass.onboarding.first-event-done", "dismissed");
    localStorage.setItem("compass.shortcuts.tips-muted", "true");
  });
  await prepareCalendarPage(page);

  const title = createEventTitle("Muted Hint");
  await openTimedEventFormWithKeyboard(page);
  await fillTitleAndSaveEventForm(page, title);

  const eventButton = page
    .locator("#mainGrid")
    .getByRole("button", { name: title });
  await eventButton.click({ force: true });
  await expect(pointerHint(page)).toHaveCount(0);
});

test("edit-open usage retires card-click teaching", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
    localStorage.setItem(
      "compass.onboarding.has-seen-shortcut-showcase",
      "true",
    );
    localStorage.setItem("compass.onboarding.first-event-done", "dismissed");
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

  const eventButton = page
    .locator("#mainGrid")
    .getByRole("button", { name: title });
  await eventButton.click({ force: true });
  await expect(pointerHint(page)).toHaveCount(0);
});

test("pointer-click Hide shows the keyboard-only toast and keeps the event", async ({
  page,
}) => {
  await prepareTeachingWeek(page);

  const title = createEventTitle("Hide Toast");
  await openTimedEventFormWithKeyboard(page);
  await fillTitleAndSaveEventForm(page, title);

  const eventButton = page
    .locator("#mainGrid")
    .getByRole("button", { name: title })
    .first();
  await expect(eventButton).toBeVisible();

  await eventButton.click({ button: "right" });

  const hideItem = page.getByRole("menuitem", {
    name: "Hide event",
    exact: true,
  });
  await expect(hideItem).toBeVisible();
  await hideItem.click();

  await expect(page.getByText(/Keyboard only, press/i)).toBeVisible();
  await expect(eventButton).toBeVisible();
});

test("keyboard activation of native buttons still works", async ({ page }) => {
  await prepareTeachingWeek(page);

  const timezoneButton = page.getByRole("button", {
    name: /Calendar timezone/,
  });
  await timezoneButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("combobox")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("combobox")).toHaveCount(0);
});
