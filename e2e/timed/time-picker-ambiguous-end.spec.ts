import { expect, test } from "@playwright/test";
import {
  openTimedEventFormWithKeyboard,
  prepareCalendarPage,
} from "../utils/event-test-utils";

test("typed 1145 on the end field resolves to 11:45 AM after an 11:30 AM start", async ({
  page,
}) => {
  await prepareCalendarPage(page);
  await openTimedEventFormWithKeyboard(page);

  const start = page.getByRole("combobox", { name: "Start time" });
  const end = page.getByRole("combobox", { name: "End time" });

  await start.click();
  await start.fill("11:30");
  await page.getByRole("option", { name: "11:30 AM" }).click();

  await end.click();
  await end.fill("1145");
  await expect(page.getByRole("option", { name: "11:45 AM" })).toBeVisible();
  await page.keyboard.press("Enter");

  await expect(end).toContainText("11:45 AM");
  await expect(page.getByText("11:45 PM")).toHaveCount(0);

  await page.screenshot({
    path: "/opt/cursor/artifacts/time-picker-1145-fixed.png",
    fullPage: false,
  });
});
