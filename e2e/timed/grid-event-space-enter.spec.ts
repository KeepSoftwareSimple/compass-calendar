import { expect, test } from "@playwright/test";
import {
  createEventTitle,
  dismissOnboardingBeforeBoot,
  expectTimedEventVisible,
  fillTitleAndSaveEventForm,
  installDeterministicBrowserClock,
  openTimedEventFormWithKeyboard,
  prepareTimedCalendarPage,
} from "../utils/event-test-utils";

const getFormTitleInput = (page: import("@playwright/test").Page) =>
  page.getByRole("form").getByRole("textbox", { name: "Title" });

const prepareTeachingWeek = async (page: import("@playwright/test").Page) => {
  await dismissOnboardingBeforeBoot(page);
  await installDeterministicBrowserClock(page);
  await page.addInitScript(() => {
    localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
    localStorage.setItem(
      "compass.onboarding.has-seen-shortcut-showcase",
      "true",
    );
    localStorage.setItem("compass.onboarding.first-event-done", "dismissed");
  });
  await prepareTimedCalendarPage(page);
};

test.describe("focused grid event keyboard", () => {
  test.use({
    viewport: { width: 1280, height: 800 },
    storageState: { cookies: [], origins: [] },
  });

  test("Space opens the context menu, Enter opens the form, Esc returns focus", async ({
    page,
  }) => {
    await prepareTeachingWeek(page);

    const title = createEventTitle("Space menu");
    await openTimedEventFormWithKeyboard(page);
    await fillTitleAndSaveEventForm(page, title);
    await expectTimedEventVisible(page, title);

    const eventButton = page
      .locator("#mainGrid")
      .getByRole("button", { name: title });
    await eventButton.focus();

    await page.keyboard.press("Space");
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("menuitem").first()).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(eventButton).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(getFormTitleInput(page)).toHaveValue(title);
  });

  test("holding Space keeps the menu open and does not open the form", async ({
    page,
  }) => {
    await prepareTeachingWeek(page);

    const title = createEventTitle("Space hold");
    await openTimedEventFormWithKeyboard(page);
    await fillTitleAndSaveEventForm(page, title);
    await expectTimedEventVisible(page, title);

    const eventButton = page
      .locator("#mainGrid")
      .getByRole("button", { name: title });
    await eventButton.focus();

    await page.keyboard.down("Space");
    await page.waitForTimeout(600);
    await page.keyboard.up("Space");

    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(getFormTitleInput(page)).toBeHidden();
    await expect(menu.getByRole("menuitem").first()).toBeFocused();
  });
});
