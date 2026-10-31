import { expect, test } from "@playwright/test";
import {
  ensureSidebarOpen,
  prepareCalendarPage,
  waitForWeekEventsLoaded,
} from "../utils/event-test-utils";

test("u returns focus from the month picker to the grid", async ({ page }) => {
  await prepareCalendarPage(page);
  await ensureSidebarOpen(page);

  await page.locator("#mainGrid").focus();
  await page.keyboard.press("i");

  const focusedPickerDay = page.locator(".react-datepicker__day:focus");
  await expect(focusedPickerDay).toBeVisible();
  const weekFocusRing = await focusedPickerDay.evaluate((el) => {
    const row = el.closest(".react-datepicker__week");
    if (!row) return null;
    const afterStyle = getComputedStyle(row, "::after");
    return afterStyle.boxShadow;
  });
  expect(weekFocusRing).toMatch(/inset/);

  const pickerDay = page.locator('.react-datepicker__day[tabindex="0"]');
  await page.keyboard.press("u");

  await expect(pickerDay).not.toBeFocused();
  await expect(page.locator("#mainGrid")).toBeFocused();
  await expect(page.getByTestId("grid-focus-indicator")).toBeVisible();
});

test("week picker and grid focus rings stay visible after keyboard focus", async ({
  page,
}) => {
  await prepareCalendarPage(page);
  await ensureSidebarOpen(page);
  await waitForWeekEventsLoaded(page);

  await page.locator("#mainGrid").focus();
  await page.keyboard.press("i");
  const focusedPickerDay = page.locator(".react-datepicker__day:focus");
  await expect(focusedPickerDay).toBeVisible();
  const weekFocusRing = await focusedPickerDay.evaluate((el) => {
    const row = el.closest(".react-datepicker__week");
    if (!row) return null;
    return getComputedStyle(row, "::after").boxShadow;
  });
  expect(weekFocusRing).toMatch(/inset/);

  await page.keyboard.press("u");
  await expect(page.locator("#mainGrid")).toBeFocused();
  await expect(page.getByTestId("grid-focus-indicator")).toBeVisible();
});

test("life view i focuses the birth date field and u returns to the grid", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("compass.onboarding.has-seen-life-view-intro", "true");
  });
  await page.goto("/life", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Life" })).toBeVisible();

  const currentWeek = page.getByRole("button", { name: /current week/i });
  if (await currentWeek.count()) {
    await currentWeek.first().focus();
  }

  const birthDate = page.getByRole("textbox", { name: "Date of birth" });
  await page.keyboard.press("i");
  await expect(birthDate).toBeFocused();
  await expect(birthDate).toHaveValue("Jan 1, 2000");

  await page.keyboard.press("u");
  if (await currentWeek.count()) {
    await expect(currentWeek.first()).toBeFocused({ timeout: 5_000 });
  }
});
