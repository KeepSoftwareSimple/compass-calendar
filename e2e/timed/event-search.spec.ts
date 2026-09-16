import { expect, test } from "@playwright/test";
import {
  createEventTitle,
  expectTimedEventVisible,
  fillTitleAndSaveEventForm,
  getPaletteSearch,
  openCommandPaletteWithKeyboard,
  openTimedEventFormWithKeyboard,
  prepareCalendarPage,
} from "../utils/event-test-utils";

test("Mod+K finds a saved event by title and focuses it", async ({ page }) => {
  await prepareCalendarPage(page);

  const title = createEventTitle("Find Me");
  await openTimedEventFormWithKeyboard(page);
  await fillTitleAndSaveEventForm(page, title);
  await expectTimedEventVisible(page, title);

  await openCommandPaletteWithKeyboard(page);
  const search = getPaletteSearch(page);
  await search.fill(title);

  const option = page.getByRole("option", { name: new RegExp(title) });
  await expect(option).toBeVisible();
  await expect(page.getByText("Events", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: /result/ }),
  ).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(search).toHaveCount(0);

  await expect(
    page.locator("#mainGrid").getByRole("button", { name: title }),
  ).toBeFocused();
});
