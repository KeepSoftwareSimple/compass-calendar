import { expect, test } from "@playwright/test";
import {
  createEventTitle,
  ensureSidebarOpen,
  fillTitleAndSaveEventForm,
  openTimedEventFormWithKeyboard,
  prepareTimedCalendarPage,
} from "../utils/event-test-utils";

test("edge focus sidebar teaches Tab and Shift+Arrow nudge keys", async ({
  page,
}) => {
  await prepareTimedCalendarPage(page);
  await ensureSidebarOpen(page);
  const title = createEventTitle("Edge Hint");
  await openTimedEventFormWithKeyboard(page);
  await fillTitleAndSaveEventForm(page, title);

  const eventButton = page
    .locator("#mainGrid")
    .getByRole("button", { name: title });
  await eventButton.focus();
  await page.keyboard.press("Tab");

  const sidebarStatus = page.locator("#sidebar [data-edge-focus-indicator]");
  await expect(sidebarStatus).toBeVisible();
  await expect(sidebarStatus).toContainText(/adjusts start/i);
  await expect(sidebarStatus).toContainText("Tab");
  await expect(sidebarStatus).not.toHaveText(/^Editing start time$/);

  await page.keyboard.press("Shift+ArrowUp");
  await expect(sidebarStatus).toContainText(/Start /);
  await expect(sidebarStatus).toContainText(/adjusts start/i);
  await expect(sidebarStatus).toContainText(/Shift/);
  await expect(sidebarStatus).toContainText(/Arrow/i);
});
