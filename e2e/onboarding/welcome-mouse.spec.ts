import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });
test.use({ viewport: { width: 1600, height: 900 } });

test("walks the welcome flow with the mouse only", async ({
  page,
}, testInfo) => {
  testInfo.setTimeout(45_000);
  await page.goto("/week", { waitUntil: "domcontentloaded" });

  const welcomeDialog = page.getByRole("dialog", {
    name: "Welcome to Compass Calendar",
  });
  await expect(welcomeDialog).toBeVisible();
  await expect(welcomeDialog.getByText(/No clicks allowed/)).toHaveCount(0);

  await welcomeDialog
    .getByRole("button", { name: "Get started for free" })
    .click();
  await expect(welcomeDialog.getByText("Step 2 of 3")).toBeVisible();

  const faqQuestions = [
    "Who is Compass for?",
    "How is Compass different?",
    "What does 'the keyboard calendar' actually mean?",
    "Why doesn't my mouse work?",
    "I don't know any shortcuts yet. Will I be lost?",
  ] as const;

  for (const question of faqQuestions) {
    const row = welcomeDialog.getByRole("button", { name: question });
    await row.click();
    await expect(row).toHaveAttribute("aria-expanded", "true");
  }

  await welcomeDialog.getByRole("button", { name: "Next" }).click();
  await expect(welcomeDialog.getByText("Step 3 of 3")).toBeVisible();

  await welcomeDialog
    .getByRole("link", { name: "Practice the shortcuts" })
    .click();

  const showcase = page.getByRole("region", { name: "Shortcut practice" });
  await expect(showcase).toBeVisible();
  await showcase.getByRole("button", { name: "Start practicing" }).click();
  await expect(showcase).toContainText("Task 1/11");
});
