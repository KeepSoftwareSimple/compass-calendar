import { expect, test } from "@playwright/test";
import {
  openCommandPaletteWithKeyboard,
  prepareCalendarPage,
} from "../utils/event-test-utils";

test("running a palette command with a shortcut names that key", async ({
  page,
}) => {
  await prepareCalendarPage(page);

  await openCommandPaletteWithKeyboard(page);
  const search = page.getByRole("textbox", { name: "Command palette search" });
  await search.fill("Create event");
  await expect(
    page.getByRole("option", { name: /Create event/ }),
  ).toBeVisible();
  await page.keyboard.press("Enter");

  await expect(page.locator("[data-pointer-hint]")).toContainText(
    "Next time, press",
  );
});
