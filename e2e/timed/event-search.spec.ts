import { expect, test } from "@playwright/test";
import {
  createEventTitle,
  expectTimedEventVisible,
  fillTitleAndSaveEventForm,
  openTimedEventFormWithKeyboard,
  prepareCalendarPage,
} from "../utils/event-test-utils";

test("Mod+K finds a saved event by title and focuses it", async ({ page }) => {
  await prepareCalendarPage(page);

  const title = createEventTitle("Find Me");
  await openTimedEventFormWithKeyboard(page);
  await fillTitleAndSaveEventForm(page, title);
  await expectTimedEventVisible(page, title);

  await page.locator("#mainGrid").focus();
  await page.keyboard.press("Control+K");
  const search = page.getByRole("textbox", { name: "Command palette search" });
  await expect(search).toBeVisible();
  await search.fill(title);

  const option = page.getByRole("option", { name: new RegExp(title) });
  await expect(option).toBeVisible();
  await expect(page.getByText("Events")).toBeVisible();
  await expect(page.getByRole("status")).toContainText(/result/);

  await page.keyboard.press("Enter");
  await expect(search).toHaveCount(0);

  const eventButton = page
    .locator("#mainGrid")
    .getByRole("button", { name: title });
  await expect(eventButton).toBeFocused();
});
