import { expect, test } from "@playwright/test";
import {
  openTimedEventFormWithKeyboard,
  prepareTimedCalendarPage,
} from "../utils/event-test-utils";

async function captureOpenPicker(page: import("@playwright/test").Page) {
  const startDate = page.locator('input[title="Pick Start Date"]');
  await startDate.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".react-datepicker")).toBeVisible();
  await expect(page.getByTestId("event-form-calendar-hint")).toBeVisible();
}

test("date picker keycap hint fits at desktop width", async ({ page }) => {
  await prepareTimedCalendarPage(page);
  await openTimedEventFormWithKeyboard(page);
  await captureOpenPicker(page);

  const hint = page.getByTestId("event-form-calendar-hint");
  const popper = page.locator(".react-datepicker-popper");
  const hintBox = await hint.boundingBox();
  const popperBox = await popper.boundingBox();
  expect(hintBox).not.toBeNull();
  expect(popperBox).not.toBeNull();
  if (hintBox && popperBox) {
    expect(hintBox.x + hintBox.width).toBeLessThanOrEqual(
      popperBox.x + popperBox.width + 1,
    );
  }

  await page.screenshot({
    path: "/opt/cursor/artifacts/after-date-picker-keycap-hint-desktop.png",
    fullPage: false,
  });
});

test("date picker keycap hint fits at 360px width", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await prepareTimedCalendarPage(page);
  await openTimedEventFormWithKeyboard(page);
  await captureOpenPicker(page);

  const hint = page.getByTestId("event-form-calendar-hint");
  const popper = page.locator(".react-datepicker-popper");
  const hintBox = await hint.boundingBox();
  const popperBox = await popper.boundingBox();
  expect(hintBox).not.toBeNull();
  expect(popperBox).not.toBeNull();
  if (hintBox && popperBox) {
    expect(hintBox.x + hintBox.width).toBeLessThanOrEqual(
      popperBox.x + popperBox.width + 1,
    );
  }

  await page.screenshot({
    path: "/opt/cursor/artifacts/after-date-picker-keycap-hint-360.png",
    fullPage: false,
  });
});
