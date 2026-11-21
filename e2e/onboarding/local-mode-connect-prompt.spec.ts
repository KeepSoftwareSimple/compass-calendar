import { expect, test } from "@playwright/test";
import { E2E_APP_CONFIG_VERSION } from "../utils/test-constants";

test.use({ storageState: { cookies: [], origins: [] } });
test.use({ viewport: { width: 1600, height: 900 } });

test("shows a trial nudge after one anonymous write and dismisses permanently", async ({
  page,
}, testInfo) => {
  await page.route("**/api/config", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        version: E2E_APP_CONFIG_VERSION,
        providers: {
          google: { signIn: true, connect: true },
          microsoft: { signIn: false, connect: false },
          apple: { signIn: false, connect: false },
        },
      }),
    });
  });

  await page.addInitScript(
    (keys) => {
      localStorage.setItem(keys.hasSeenWelcome, "true");
      localStorage.setItem(keys.firstEventDone, "completed");
      localStorage.setItem(keys.writeCount, "1");
      localStorage.removeItem(keys.dismissed);
    },
    {
      hasSeenWelcome: "compass.onboarding.has-seen-welcome",
      firstEventDone: "compass.onboarding.first-event-done",
      writeCount: "compass.onboarding.anonymous-calendar-write-count",
      dismissed: "compass.onboarding.has-dismissed-local-mode-connect-prompt",
    },
  );

  await page.goto("/week", { waitUntil: "domcontentloaded" });

  const prompt = page.getByRole("complementary", {
    name: "Start your free trial",
  });
  await expect(prompt).toBeVisible();
  await expect(prompt).toContainText(
    "Start your free trial to save this calendar to your account.",
  );
  await expect(
    prompt.getByRole("button", { name: "Start free trial" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("local-mode-connect-prompt-demo.png"),
  });

  await prompt.getByRole("button", { name: "Dismiss" }).click();
  await expect(prompt).toHaveCount(0);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(prompt).toHaveCount(0);
});
