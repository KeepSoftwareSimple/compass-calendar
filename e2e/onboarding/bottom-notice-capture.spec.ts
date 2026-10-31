import { expect, type Page, test } from "@playwright/test";

async function prepareSession(page: Page, blockAppUpdate: boolean) {
  await page.route(/version\.json(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ version: "99.99.99" }),
    });
  });

  await page.addInitScript(
    ({ blockUpdate }) => {
      localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
      localStorage.setItem(
        "compass.onboarding.has-seen-shortcut-showcase",
        "true",
      );
      localStorage.removeItem("compass.onboarding.first-event-done");
      if (blockUpdate) {
        localStorage.setItem(
          "compass.app-update.notice-handled-versions",
          JSON.stringify(["99.99.99"]),
        );
      } else {
        localStorage.removeItem("compass.app-update.notice-handled-versions");
      }
    },
    { blockUpdate: blockAppUpdate },
  );
}

async function openWeek(page: Page) {
  await page.goto("/week", { waitUntil: "networkidle" });
}

async function showAppUpdateNotice(page: Page) {
  await page.evaluate(() => {
    localStorage.removeItem("compass.app-update.notice-handled-versions");
    (
      window as Window & {
        __compassE2E?: {
          showAppUpdateAvailableToast: (version: string) => void;
        };
      }
    ).__compassE2E?.showAppUpdateAvailableToast("99.99.99");
  });
}

const captures = [
  {
    name: "update-1280",
    width: 1280,
    height: 900,
    kind: "update" as const,
    path: "/opt/cursor/artifacts/bottom-notice-update-1280.png",
  },
  {
    name: "update-360",
    width: 360,
    height: 740,
    kind: "update" as const,
    path: "/opt/cursor/artifacts/bottom-notice-update-360.png",
  },
  {
    name: "first-event-1280",
    width: 1280,
    height: 900,
    kind: "first-event" as const,
    path: "/opt/cursor/artifacts/bottom-notice-first-event-1280.png",
  },
  {
    name: "first-event-360",
    width: 360,
    height: 740,
    kind: "first-event" as const,
    path: "/opt/cursor/artifacts/bottom-notice-first-event-360.png",
  },
];

test.describe("bottom notice capture", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const capture of captures) {
    test(capture.name, async ({ page }, testInfo) => {
      testInfo.setTimeout(240_000);
      await page.setViewportSize({
        width: capture.width,
        height: capture.height,
      });
      await prepareSession(page, capture.kind === "first-event");
      await openWeek(page);

      if (capture.kind === "update") {
        await showAppUpdateNotice(page);
        const notice = page.locator('[data-app-update-notice=""]');
        await expect(notice).toBeVisible({ timeout: 60_000 });
        await notice.screenshot({ path: capture.path });
        return;
      }

      const firstEvent = page.locator('[data-first-event-prompt=""]');
      await expect(firstEvent).toBeVisible({ timeout: 60_000 });
      await firstEvent.screenshot({ path: capture.path });
    });
  }
});
