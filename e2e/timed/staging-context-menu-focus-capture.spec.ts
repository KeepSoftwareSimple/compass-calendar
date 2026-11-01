import { expect, test } from "@playwright/test";
import {
  createEventTitle,
  dismissOnboardingBeforeBoot,
  expectTimedEventVisible,
  fillTitleAndSaveEventForm,
  installDeterministicBrowserClock,
  openTimedEventFormWithKeyboard,
  prepareCalendarPage,
} from "../utils/event-test-utils";

const ARTIFACT_DIR = "/opt/cursor/artifacts";

test.describe("staging context menu focus capture", () => {
  test.use({
    viewport: { width: 1280, height: 800 },
    storageState: { cookies: [], origins: [] },
  });

  test("keyboard-focused menu item at 1280px", async ({ page }) => {
    test.skip(
      !process.env.STAGING_CONTEXT_MENU_CAPTURE,
      "Set STAGING_CONTEXT_MENU_CAPTURE=1 to run against staging",
    );

    await dismissOnboardingBeforeBoot(page);
    await installDeterministicBrowserClock(page);
    await prepareCalendarPage(page);

    const title = createEventTitle("Focus capture");
    await openTimedEventFormWithKeyboard(page);
    await fillTitleAndSaveEventForm(page, title);
    await expectTimedEventVisible(page, title);

    const eventButton = page
      .locator("#mainGrid")
      .getByRole("button", { name: title });
    await eventButton.focus();
    await page.keyboard.press(".");

    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem").first()).toBeFocused();

    const prefix = process.env.CONTEXT_MENU_CAPTURE_PREFIX ?? "before";
    await menu.screenshot({
      path: `${ARTIFACT_DIR}/${prefix}-context-menu-focus-1280.png`,
    });
  });
});
