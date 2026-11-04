import { expect, test } from "@playwright/test";
import { STORAGE_KEYS } from "../../apps/calendar-web/src/common/constants/storage.constants";
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from "../../apps/calendar-web/src/components/Sidebar/storage/sidebar-width.constants";
import {
  ensureSidebarOpen,
  prepareCalendarPage,
} from "../utils/event-test-utils";

async function showMonthPickerHint(page: import("@playwright/test").Page) {
  const monthPicker = page
    .locator("#sidebar")
    .getByRole("group", { name: "Date navigation" });
  await expect(monthPicker).toBeVisible();

  const tabStopDay = monthPicker.locator(
    '.react-datepicker__day[tabindex="0"]',
  );
  await tabStopDay.focus();
  await page.keyboard.press("ArrowDown");

  const hint = page.getByTestId("month-picker-keycap-hint");
  await expect(hint).toBeVisible();
  return { monthPicker, hint };
}

async function setSidebarWidth(
  page: import("@playwright/test").Page,
  width: number,
) {
  await page.addInitScript(
    ({ storageKey, sidebarWidth }) => {
      localStorage.setItem(storageKey, String(sidebarWidth));
    },
    { storageKey: STORAGE_KEYS.SIDEBAR_WIDTH, sidebarWidth: width },
  );
}

test("month picker keycap hint fits at wide sidebar width", async ({
  page,
}) => {
  await setSidebarWidth(page, SIDEBAR_MAX_WIDTH);
  await prepareCalendarPage(page);
  await ensureSidebarOpen(page);

  const { monthPicker, hint } = await showMonthPickerHint(page);
  const upNext = page
    .locator("#sidebar")
    .getByRole("region", { name: "Up next" });

  const hintBox = await hint.boundingBox();
  const pickerBox = await monthPicker.boundingBox();
  expect(hintBox).not.toBeNull();
  expect(pickerBox).not.toBeNull();
  if (hintBox && pickerBox) {
    expect(hintBox.x).toBeGreaterThanOrEqual(pickerBox.x - 1);
    expect(hintBox.x + hintBox.width).toBeLessThanOrEqual(
      pickerBox.x + pickerBox.width + 1,
    );
  }

  if (await upNext.isVisible()) {
    const upNextBox = await upNext.boundingBox();
    if (hintBox && upNextBox) {
      expect(hintBox.y + hintBox.height).toBeLessThanOrEqual(upNextBox.y + 1);
    }
  }

  await page.screenshot({
    path: "/opt/cursor/artifacts/after-month-picker-keycap-hint-wide.png",
    fullPage: false,
  });
});

test("month picker keycap hint fits at narrow sidebar width", async ({
  page,
}) => {
  await setSidebarWidth(page, SIDEBAR_MIN_WIDTH);
  await prepareCalendarPage(page);
  await ensureSidebarOpen(page);

  const { monthPicker, hint } = await showMonthPickerHint(page);
  const upNext = page
    .locator("#sidebar")
    .getByRole("region", { name: "Up next" });

  const hintBox = await hint.boundingBox();
  const pickerBox = await monthPicker.boundingBox();
  expect(hintBox).not.toBeNull();
  expect(pickerBox).not.toBeNull();
  if (hintBox && pickerBox) {
    expect(hintBox.x).toBeGreaterThanOrEqual(pickerBox.x - 1);
    expect(hintBox.x + hintBox.width).toBeLessThanOrEqual(
      pickerBox.x + pickerBox.width + 1,
    );
  }

  if (await upNext.isVisible()) {
    const upNextBox = await upNext.boundingBox();
    if (hintBox && upNextBox) {
      expect(hintBox.y + hintBox.height).toBeLessThanOrEqual(upNextBox.y + 1);
    }
  }

  await page.screenshot({
    path: "/opt/cursor/artifacts/after-month-picker-keycap-hint-narrow.png",
    fullPage: false,
  });
});
