import { expect, type Page, test } from "@playwright/test";
import {
  installDeterministicBrowserClock,
  openCommandPaletteWithKeyboard,
} from "../utils/event-test-utils";

test.use({ storageState: { cookies: [], origins: [] } });
test.use({ viewport: { width: 1280, height: 900 } });

const openPractice = async (page: Page) => {
  await installDeterministicBrowserClock(page);
  await page.goto("/week", { waitUntil: "domcontentloaded" });
  const welcomeDialog = page.getByRole("dialog", {
    name: "Welcome to Compass Calendar",
  });
  await expect(welcomeDialog).toBeVisible();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(welcomeDialog.getByText("Step 3 of 3")).toBeVisible();
  await page.keyboard.press("s");
  await expect(welcomeDialog).toBeHidden();
  const practice = page.getByRole("region", { name: "Shortcut practice" });
  await expect(practice).toBeVisible();
  return practice;
};

test("local explorers learn shortcuts in Block Party after the account choice", async ({
  page,
}) => {
  const practice = await openPractice(page);
  await expect(
    practice.getByRole("heading", { name: "Learn Compass by doing" }),
  ).toBeVisible();
  await practice.getByRole("button", { name: "Start practicing" }).click();
  await expect(practice).toContainText("Task 1/11");
  await page.keyboard.press("c");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await expect(practice).toContainText("Task 2/11");
});

test("calendar shortcuts work after leaving practice", async ({ page }) => {
  const practice = await openPractice(page);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(practice).toBeHidden();

  const firstEventPrompt = page.getByRole("complementary", {
    name: "Create your first event",
  });
  await expect(firstEventPrompt).toBeVisible();
  await page.keyboard.press("c");
  await expect(firstEventPrompt).toContainText("It's on the calendar.");

  await openCommandPaletteWithKeyboard(page);
  await page.keyboard.press("Escape");

  await page.locator("#mainGrid").focus();
  await page.keyboard.press("Shift+?");
  await expect(page.getByPlaceholder("Search shortcuts...")).toBeVisible();
  await page.keyboard.press("Escape");

  const todayHeading = await page
    .getByRole("heading", { level: 1 })
    .innerText();
  const firstDay = page
    .getByRole("region", { name: "All-day events" })
    .getByRole("columnheader")
    .first();
  const todayMonth = page.getByRole("heading", {
    name: todayHeading,
    exact: true,
  });
  // Page size depends on the viewport, so keep navigating until the month changes.
  for (let step = 0; step < 35 && (await todayMonth.isVisible()); step++) {
    const previousDate = await firstDay.getAttribute("aria-label");
    expect(previousDate).not.toBeNull();
    await page.getByRole("button", { name: "Previous week" }).click();
    await expect(firstDay).not.toHaveAttribute("aria-label", previousDate!);
  }
  await expect(
    page.getByRole("heading", { name: todayHeading, exact: true }),
  ).toBeHidden();
  await page.locator("#mainGrid").focus();
  await page.keyboard.press("t");
  await expect(
    page.getByRole("heading", { name: todayHeading, exact: true }),
  ).toBeVisible();
});
