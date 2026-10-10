import { expect, test } from "@playwright/test";
import {
  installDeterministicBrowserClock,
  openTimedEventFormWithKeyboard,
  prepareCalendarPage,
} from "../utils/event-test-utils";

test("typed 1145 on the end field resolves to 11:45 AM after an 11:30 AM start", async ({
  page,
}) => {
  // Start-field parsing picks the meridiem nearest the draft default (wall
  // clock). Pin before navigation so "11:30" stays AM regardless of CI hour.
  await installDeterministicBrowserClock(page);
  await prepareCalendarPage(page);
  await openTimedEventFormWithKeyboard(page);

  const start = page.getByRole("combobox", { name: "Start time" });
  const end = page.getByRole("combobox", { name: "End time" });

  await start.click();
  await start.fill("11:30");
  await page.getByRole("option", { name: "11:30 AM" }).click();

  await end.click();
  await end.pressSequentially("1145");
  const suggestion = page.getByRole("option", { name: "11:45 AM" });
  await expect(suggestion).toBeVisible();
  await suggestion.click();

  await expect(page.locator("#endTimePicker")).toContainText("11:45 AM");
  await expect(page.locator("#endTimePicker")).not.toContainText("11:45 PM");

  await page.locator("#endTimePicker").screenshot({
    path: "/opt/cursor/artifacts/time-picker-1145-fixed.png",
  });
});
