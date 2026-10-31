import { expect, type Page, test } from "@playwright/test";
import {
  installParityWebEnvironment,
  prepareParityDemoWeek,
} from "../parity/seed-demo-fixture.util";
import { putLocalEventRecords } from "../utils/local-event-seed.util";

const DEMO_REFERENCE_NOW = "2026-06-10T15:00:00.000Z";
const DEMO_CALENDAR_ID = "507f1f77bcf86cd799439011";
const NUDGE_EVENT_ID = "aaaaaaaaaaaaaaaaaaaaaaa1";

async function stubAppUpdateCheck(page: Page) {
  await page.route(/version\.json(\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ version: "99.99.99" }),
    });
  });
}

async function seedUpNextWindowEvent(page: Page) {
  await putLocalEventRecords(
    page,
    [
      {
        version: 2,
        id: NUDGE_EVENT_ID,
        isDemo: false,
        event: {
          id: NUDGE_EVENT_ID,
          calendarId: DEMO_CALENDAR_ID,
          content: {
            kind: "details",
            title: "Up next suppression probe",
            description: "",
          },
          schedule: {
            kind: "timed",
            start: "2026-06-10T15:00:00+00:00",
            end: "2026-06-10T15:30:00+00:00",
            timeZone: "UTC",
          },
          recurrence: { kind: "single" },
          createdAt: DEMO_REFERENCE_NOW,
          updatedAt: null,
        },
      },
    ],
    { replaceAll: true },
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#timedColumns").waitFor({ timeout: 20_000 });
}

async function queueAppUpdateToast(page: Page) {
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
}

async function assertNoBottomLeftNotices(page: Page) {
  await expect(page.locator("section.compass-bottom-notice-stack")).toHaveCount(
    0,
  );
  await expect(page.locator("[data-up-next-banner]")).toHaveCount(0);
  await expect(
    page.locator(".Toastify__toast.app-update-available-toast-host"),
  ).toHaveCount(0);
}

async function prepareNoticeSuppressionSession(page: Page) {
  await stubAppUpdateCheck(page);
  await page.addInitScript(() => {
    localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
    localStorage.removeItem("compass.onboarding.has-seen-shortcut-showcase");
    localStorage.setItem("compass.onboarding.first-event-done", "dismissed");
    localStorage.removeItem("compass.app-update.notice-handled-versions");
  });
  await installParityWebEnvironment(page);
  await prepareParityDemoWeek(page);
  await seedUpNextWindowEvent(page);
}

test.describe("bottom notices during auth and onboarding", () => {
  test("hides during signup auth modal", async ({ page }) => {
    await prepareNoticeSuppressionSession(page);
    await page.goto("/week?auth=signup", { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel("Email")).toBeVisible({ timeout: 10_000 });
    await assertNoBottomLeftNotices(page);
  });

  test("hides during first-event onboarding prompt", async ({ page }) => {
    await stubAppUpdateCheck(page);
    await installParityWebEnvironment(page);
    await page.addInitScript(() => {
      localStorage.removeItem("compass.onboarding.first-event-done");
    });
    await prepareParityDemoWeek(page);
    await seedUpNextWindowEvent(page);

    const firstEventPrompt = page.getByRole("complementary", {
      name: "Create your first event",
    });
    await expect(firstEventPrompt).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("[data-up-next-banner]")).toHaveCount(0);
  });

  test("queues nudge and refresh toast during signup and onboarding, then shows both", async ({
    page,
  }, testInfo) => {
    testInfo.setTimeout(120_000);
    await prepareNoticeSuppressionSession(page);

    await page.goto("/week?auth=signup", { waitUntil: "domcontentloaded" });
    await expect(page.getByLabel("Email")).toBeVisible({ timeout: 10_000 });
    await queueAppUpdateToast(page);
    await assertNoBottomLeftNotices(page);

    await page.goto("/week?play=1", { waitUntil: "domcontentloaded" });
    const showcase = page.getByRole("region", { name: "Shortcut practice" });
    await expect(showcase).toBeVisible({ timeout: 15_000 });
    await queueAppUpdateToast(page);
    await assertNoBottomLeftNotices(page);

    await page.evaluate(() => {
      localStorage.setItem(
        "compass.onboarding.has-seen-shortcut-showcase",
        "true",
      );
      localStorage.removeItem("compass.onboarding.shortcut-showcase-step");
    });
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(showcase).toBeHidden({ timeout: 15_000 });

    await expect(page.locator("[data-up-next-banner]")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.locator(".Toastify__toast.app-update-available-toast-host"),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Compass just got better")).toBeVisible();
  });

  test("shows after onboarding is complete", async ({ page }) => {
    await prepareNoticeSuppressionSession(page);
    await page.goto("/week", { waitUntil: "domcontentloaded" });
    await page.keyboard.press("t");

    await expect(page.locator("[data-up-next-banner]")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator("[data-up-next-banner]")).toContainText(
      "Up next suppression probe",
    );
  });
});
