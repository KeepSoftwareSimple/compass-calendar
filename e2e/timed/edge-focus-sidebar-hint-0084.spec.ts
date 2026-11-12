import { expect, test } from "@playwright/test";
import {
  createEventTitle,
  fillTitleAndSaveEventForm,
  openTimedEventFormWithKeyboard,
  prepareTimedCalendarPage,
} from "../utils/event-test-utils";
import path from "node:path";

const ARTIFACT_DIR = "/opt/cursor/artifacts";

test("@artifact edge focus sidebar teaches nudge keys", async ({ page }) => {
  await prepareTimedCalendarPage(page);
  const title = createEventTitle("Edge Hint");
  await openTimedEventFormWithKeyboard(page);
  await fillTitleAndSaveEventForm(page, title);

  const eventButton = page
    .locator("#mainGrid")
    .getByRole("button", { name: title });
  await eventButton.focus();
  await page.keyboard.press("Tab");

  const status = page.locator("[data-edge-focus-indicator]");
  await expect(status).toContainText(/adjusts start/i);
  await expect(status).toContainText(/Tab/i);
  await expect(status).not.toHaveText(/^Editing start time$/);

  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "edge-focus-start-time-sidebar-hint.png"),
  });

  await page.keyboard.press("Shift+ArrowUp");
  await expect(status).toContainText(/Start /);
  await expect(status).toContainText(/adjusts start/i);
});
