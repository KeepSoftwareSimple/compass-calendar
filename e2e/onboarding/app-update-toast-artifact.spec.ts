import { expect, test } from "@playwright/test";
import { DETERMINISTIC_E2E_CLOCK_NO_SAMPLE_EVENT } from "../utils/event-test-utils";

async function prepareSession(page: import("@playwright/test").Page) {
  await page.clock.install({ time: DETERMINISTIC_E2E_CLOCK_NO_SAMPLE_EVENT });
  await page.route(/version\.json(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ version: "99.99.99" }),
    });
  });

  await page.addInitScript(() => {
    localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
    localStorage.setItem(
      "compass.onboarding.has-seen-shortcut-showcase",
      "true",
    );
    localStorage.removeItem("compass.onboarding.first-event-done");
    localStorage.removeItem("compass.app-update.notice-handled-versions");
  });
}

async function showUpdateToast(page: import("@playwright/test").Page) {
  const updateToast = page.locator(
    ".Toastify__toast.app-update-available-toast-host",
  );
  await page.goto("/week", { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.removeItem("compass.app-update.notice-handled-versions");
    const helpers = (
      window as Window & {
        __compassE2E?: {
          showAppUpdateAvailableToast: (version: string) => void;
        };
      }
    ).__compassE2E;
    helpers?.showAppUpdateAvailableToast("99.99.99");
  });
  await expect(updateToast).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Compass just got better.")).toBeVisible();
  return updateToast;
}

for (const { name, stored } of [
  { name: "light", stored: "light-beach" },
  { name: "dark", stored: "dark-abyss" },
] as const) {
  test(`artifact: app update toast (${name})`, { tag: "@artifact" }, async ({
    page,
  }) => {
    await prepareSession(page);
    await page.addInitScript((theme) => {
      localStorage.setItem("compass.theme", theme);
    }, stored);
    const updateToast = await showUpdateToast(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", stored);

    await updateToast.screenshot({
      path: test.info().outputPath(`app-update-toast-${name}.png`),
    });
  });
}
