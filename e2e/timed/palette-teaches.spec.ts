import { expect, test } from "@playwright/test";
import {
  getPaletteSearch,
  openCommandPaletteWithKeyboard,
  prepareCalendarPage,
} from "../utils/event-test-utils";

test("running a palette command with a shortcut names that key", async ({
  page,
}) => {
  await prepareCalendarPage(page);

  await openCommandPaletteWithKeyboard(page);
  const search = getPaletteSearch(page);
  await search.fill("Create event");
  await expect(
    page.getByRole("option", { name: /Create event/ }),
  ).toBeVisible();
  await page.keyboard.press("Enter");

  await expect(page.locator("[data-pointer-hint]")).toContainText(
    "Next time, press",
  );
});
