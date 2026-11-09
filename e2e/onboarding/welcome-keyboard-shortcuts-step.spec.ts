import { expect, type Page, test } from "@playwright/test";
import { openCommandPaletteWithKeyboard } from "../utils/event-test-utils";

test.use({ storageState: { cookies: [], origins: [] } });
test.use({ viewport: { width: 1280, height: 900 } });

const openEssentialShortcutsStep = async (page: Page) => {
  await page.goto("/week", { waitUntil: "domcontentloaded" });

  const welcomeDialog = page.getByRole("dialog", {
    name: "Welcome to Compass Calendar",
  });
  await expect(welcomeDialog).toBeVisible();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(welcomeDialog.getByText("Step 3 of 4")).toBeVisible();
  await page.keyboard.press("s");
  await expect(welcomeDialog.getByText("Step 4 of 4")).toBeVisible();
  await expect(
    welcomeDialog.getByRole("heading", { name: "Essential shortcuts" }),
  ).toBeVisible();
  return welcomeDialog;
};

test("local explorers see keyboard shortcuts after the account choice", async ({
  page,
}) => {
  const welcomeDialog = await openEssentialShortcutsStep(page);
  await expect(welcomeDialog.getByText("Create an event")).toBeVisible();
  await expect(
    welcomeDialog.getByText("Open the command palette"),
  ).toBeVisible();
});

test("essential shortcuts step keycaps work on web", async ({ page }) => {
  const welcomeDialog = await openEssentialShortcutsStep(page);

  await page.keyboard.press("Escape");
  await expect(welcomeDialog.getByText("Step 3 of 4")).toBeVisible();
  await page.keyboard.press("s");
  await expect(welcomeDialog.getByText("Step 4 of 4")).toBeVisible();

  await welcomeDialog.getByRole("button", { name: "Log in" }).focus();
  await page.keyboard.press("i");
  const loginDialog = page.getByRole("dialog", { name: "Hey, welcome back" });
  await expect(loginDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(loginDialog).toBeHidden();

  await page.keyboard.press("Enter");
  await expect(welcomeDialog).toBeHidden();

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
