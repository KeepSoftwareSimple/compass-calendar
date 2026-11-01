import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });
test.use({ viewport: { width: 1280, height: 900 } });

test("the first-event prompt creates from the C keycap shortcut", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
    localStorage.setItem(
      "compass.onboarding.has-seen-shortcut-showcase",
      "true",
    );
    localStorage.removeItem("compass.onboarding.first-event-done");
  });

  await page.goto("/week", { waitUntil: "domcontentloaded" });

  const prompt = page.getByRole("complementary", {
    name: "Create your first event",
  });
  await expect(prompt).toBeVisible();
  const addEvent = prompt.getByRole("button", { name: "Add event" });
  await expect(addEvent).toBeVisible();
  await expect(addEvent.getByTestId("c-icon")).toBeVisible();

  await page.keyboard.press("c");
  await expect(prompt).toContainText("It's on the calendar.");
});
