import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });
test.use({ viewport: { width: 1600, height: 900 } });

test("Enter advances welcome after clicking modal body text", async ({
  page,
}) => {
  await page.goto("/week", { waitUntil: "domcontentloaded" });

  const welcomeDialog = page.getByRole("dialog", {
    name: "Welcome to Compass Calendar",
  });
  await expect(welcomeDialog).toBeVisible();

  await welcomeDialog
    .getByRole("heading", { name: "The Keyboard Calendar" })
    .click();
  await expect(welcomeDialog).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(welcomeDialog.getByText("Step 2 of 3")).toBeVisible();
});
