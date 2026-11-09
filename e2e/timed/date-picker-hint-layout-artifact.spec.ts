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

async function expectHintFits(page: import("@playwright/test").Page) {
  const hint = page.getByTestId("event-form-calendar-hint");
  const popper = page.locator(".react-datepicker-popper");
  // Popover positioning can briefly remount its header after it becomes visible.
  await expect
    .poll(async () => {
      const [hintBox, popperBox] = await Promise.all([
        hint.boundingBox(),
        popper.boundingBox(),
      ]);
      return (
        hintBox !== null &&
        popperBox !== null &&
        hintBox.x >= popperBox.x - 1 &&
        hintBox.x + hintBox.width <= popperBox.x + popperBox.width + 1
      );
    })
    .toBe(true);
}

test("date picker keycap hint fits at desktop width", async ({ page }) => {
  await prepareTimedCalendarPage(page);
  await openTimedEventFormWithKeyboard(page);
  await captureOpenPicker(page);

  await expectHintFits(page);
  await page.screenshot({
    path: test.info().outputPath("date-picker-keycap-hint-desktop.png"),
    fullPage: false,
  });
});

test("date picker keycap hint fits at 360px width", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await prepareTimedCalendarPage(page);
  await openTimedEventFormWithKeyboard(page);
  await captureOpenPicker(page);

  await expectHintFits(page);
  await page.screenshot({
    path: test.info().outputPath("date-picker-keycap-hint-360.png"),
    fullPage: false,
  });
});
