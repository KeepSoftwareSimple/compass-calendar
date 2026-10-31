import { expect, test } from "@playwright/test";

const ARTIFACT_DIR = "/opt/cursor/artifacts";

async function reachFirstEventPrompt(page: import("@playwright/test").Page) {
  await page.goto("/week", { waitUntil: "domcontentloaded" });

  const welcomeDialog = page.getByRole("dialog", {
    name: "Welcome to Compass Calendar",
  });
  await expect(welcomeDialog).toBeVisible();
  await welcomeDialog
    .getByRole("button", { name: "Get started for free" })
    .click();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.press("s");
  await expect(welcomeDialog.getByText("Step 4 of 4")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(welcomeDialog).toBeHidden();

  const prompt = page.getByRole("complementary", {
    name: "Create your first event",
  });
  await expect(prompt).toBeVisible();
  return prompt;
}

test.describe("staging first-event prompt capture", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("1280px desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await reachFirstEventPrompt(page);
    await page.screenshot({
      path: `${ARTIFACT_DIR}/${process.env.FIRST_EVENT_CAPTURE_PREFIX ?? "before"}-first-event-prompt-1280.png`,
      fullPage: false,
    });
  });

  test("360px phone", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await reachFirstEventPrompt(page);
    await page.screenshot({
      path: `${ARTIFACT_DIR}/${process.env.FIRST_EVENT_CAPTURE_PREFIX ?? "before"}-first-event-prompt-360.png`,
      fullPage: false,
    });
  });
});
