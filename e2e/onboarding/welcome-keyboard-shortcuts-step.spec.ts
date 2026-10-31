import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });
test.use({ viewport: { width: 1280, height: 900 } });

test("local explorers see keyboard shortcuts after the account choice", async ({
  page,
}) => {
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
  await expect(welcomeDialog.getByText("Create an event")).toBeVisible();
  await expect(
    welcomeDialog.getByText("Open the command palette"),
  ).toBeVisible();
});
