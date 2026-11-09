import { expect, test } from "@playwright/test";
import {
  ensureSidebarOpen,
  openTimedEventFormWithKeyboard,
  prepareTimedCalendarPage,
} from "../utils/event-test-utils";

async function captureSidebarDatePickerHint(
  page: import("@playwright/test").Page,
) {
  const startDate = page.locator('input[title="Pick Start Date"]');
  await startDate.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator(".react-datepicker")).toBeVisible();

  const contextual = page
    .locator("#sidebar")
    .getByTestId("date-picker-contextual-hint");
  await expect(contextual).toBeVisible();
  await expect(contextual).toContainText("PageDown");

  await expect(page.getByTestId("event-form-calendar-hint")).toHaveCount(0);
}

test("artifact: date picker keyboard hints live in the sidebar, not in the popover", {
  tag: "@artifact",
}, async ({ page }) => {
  await prepareTimedCalendarPage(page);
  await ensureSidebarOpen(page);
  await openTimedEventFormWithKeyboard(page);
  await captureSidebarDatePickerHint(page);

  await page.screenshot({
    path: test.info().outputPath("date-picker-sidebar-hint-desktop.png"),
    fullPage: false,
  });
});

test("artifact: sidebar date picker hints stay visible at narrow width", {
  tag: "@artifact",
}, async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await prepareTimedCalendarPage(page);
  await ensureSidebarOpen(page);
  await openTimedEventFormWithKeyboard(page);
  await captureSidebarDatePickerHint(page);

  await page.screenshot({
    path: test.info().outputPath("date-picker-sidebar-hint-360.png"),
    fullPage: false,
  });
});
