import { expect, test } from "@playwright/test";
import {
  openTimedEventFormWithKeyboard,
  prepareTimedCalendarPage,
} from "../utils/event-test-utils";

const isMac = process.platform === "darwin";

const pressToggleAllDayChord = async (
  page: import("@playwright/test").Page,
) => {
  await page.keyboard.down(isMac ? "Meta" : "Control");
  await page.keyboard.down("Alt");
  await page.keyboard.press("a");
  await page.keyboard.up("Alt");
  await page.keyboard.up(isMac ? "Meta" : "Control");
};

test.beforeEach(async ({ page }) => {
  await prepareTimedCalendarPage(page);
});

test("form footer tips teach tab navigation and Mod+0 actions", async ({
  page,
}, testInfo) => {
  await openTimedEventFormWithKeyboard(page);

  const title = page.getByRole("form").getByPlaceholder("Title");
  await title.focus();

  const tips = page.getByTestId("event-form-footer-tips");
  await expect(tips).toBeVisible();
  await expect(tips).toContainText("between fields");
  await expect(tips).not.toContainText("0 for actions");
  await page.getByRole("button", { name: "More" }).click();
  await expect(tips).toContainText("0 for actions");
  await expect(page.getByRole("button", { name: "Hide tips" })).toHaveCount(0);

  await page.screenshot({
    path: testInfo.outputPath("event-form-footer-tips.png"),
    fullPage: true,
  });
});

test("Mod+Alt+A toggles all day from the title field without typing a character", async ({
  page,
}, testInfo) => {
  await openTimedEventFormWithKeyboard(page);

  const title = page.getByRole("form").getByPlaceholder("Title");
  await title.focus();
  await title.fill("Keyboard all-day");

  const allDay = page.getByRole("checkbox", { name: "All day?" });
  await expect(allDay).not.toBeChecked();

  await pressToggleAllDayChord(page);
  await expect(allDay).toBeChecked();
  await expect(title).toHaveValue("Keyboard all-day");

  await pressToggleAllDayChord(page);
  await expect(allDay).not.toBeChecked();

  await allDay.focus();
  await page.screenshot({
    path: testInfo.outputPath("event-form-allday-keycap.png"),
    fullPage: true,
  });
});
