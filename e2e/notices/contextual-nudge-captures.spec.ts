import { expect, type Page, test } from "@playwright/test";
import {
  installParityWebEnvironment,
  prepareParityDemoWeek,
} from "../parity/seed-demo-fixture.util";

declare global {
  interface Window {
    __compassE2E?: {
      showRecurrenceScopeCaptureToast?: () => void;
    };
  }
}

import { putLocalEventRecords } from "../utils/local-event-seed.util";
import { mkdirSync } from "node:fs";

const artifactDir = process.env.NUDGE_CAPTURE_OUT ?? "/opt/cursor/artifacts";

const DEMO_REFERENCE_NOW = "2026-06-10T15:00:00.000Z";
const DEMO_CALENDAR_ID = "507f1f77bcf86cd799439011";
const NUDGE_EVENT_A = "aaaaaaaaaaaaaaaaaaaaaaa1";
const NUDGE_EVENT_B = "aaaaaaaaaaaaaaaaaaaaaaa2";

const captureEnabled =
  process.env.NUDGE_CAPTURE === "1" ||
  process.env.STAGING_NUDGE_CAPTURE === "1";

test.describe("contextual nudge captures (local parity)", () => {
  test.skip(!captureEnabled, "Set NUDGE_CAPTURE=1");

  test.beforeAll(() => {
    mkdirSync(artifactDir, { recursive: true });
  });

  test.beforeEach(async ({ page }) => {
    await installParityWebEnvironment(page);
  });

  async function assertPastOnboarding(page: Page) {
    await expect(
      page.getByRole("heading", { name: "The Keyboard Calendar" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("dialog", { name: "Welcome to Compass Calendar" }),
    ).toBeHidden();
  }

  async function assertPointerHintDoesNotOverlapMonthHeader(page: Page) {
    await expect(page.locator("[data-pointer-hint]")).toHaveCount(0);
    const overlaps = await page.evaluate(() => {
      const hint = document.querySelector("[data-pointer-hint]");
      if (!hint) return false;
      const hintRect = hint.getBoundingClientRect();
      const monthHeader = Array.from(
        document.querySelectorAll("button, h1, h2, h3, span, div"),
      ).find((node) => node.textContent?.trim() === "June 2026");
      if (!monthHeader) return false;
      const headerRect = monthHeader.getBoundingClientRect();
      const separated =
        hintRect.bottom <= headerRect.top ||
        hintRect.top >= headerRect.bottom ||
        hintRect.right <= headerRect.left ||
        hintRect.left >= headerRect.right;
      return !separated;
    });
    expect(overlaps).toBe(false);
  }

  /** Keep parity captures from stacking unrelated nudges over the target toast. */
  async function dismissIncidentalNudges(page: Page) {
    const upNext = page.locator("[data-up-next-banner]");
    if (await upNext.isVisible().catch(() => false)) {
      await page.keyboard.press("Escape");
      await expect(upNext).toBeHidden({ timeout: 5_000 });
    }
    const sampleBanner = page
      .getByRole("status")
      .filter({ hasText: "Sample events to help you explore" });
    const okay = sampleBanner.getByText("Okay", { exact: true });
    if (await okay.isVisible().catch(() => false)) {
      await okay.click();
      await sampleBanner
        .waitFor({ state: "hidden", timeout: 5_000 })
        .catch(() => {});
    }
  }

  async function seedNudgeWindowEvents(page: Page, count: 1 | 2) {
    const records = [
      {
        version: 2,
        id: NUDGE_EVENT_A,
        isDemo: false,
        event: {
          id: NUDGE_EVENT_A,
          calendarId: DEMO_CALENDAR_ID,
          content: {
            kind: "details",
            title: "Capture standup A",
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
      ...(count === 2
        ? [
            {
              version: 2,
              id: NUDGE_EVENT_B,
              isDemo: false,
              event: {
                id: NUDGE_EVENT_B,
                calendarId: DEMO_CALENDAR_ID,
                content: {
                  kind: "details",
                  title: "Capture standup B",
                  description: "",
                },
                schedule: {
                  kind: "timed",
                  start: "2026-06-10T15:01:00+00:00",
                  end: "2026-06-10T15:31:00+00:00",
                  timeZone: "UTC",
                },
                recurrence: { kind: "single" },
                createdAt: DEMO_REFERENCE_NOW,
                updatedAt: null,
              },
            },
          ]
        : []),
    ];

    await putLocalEventRecords(page, records, { replaceAll: true });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#timedColumns").waitFor({ timeout: 20_000 });
    await page.keyboard.press("t");
    await expect(page.locator("[data-up-next-banner]")).toBeVisible({
      timeout: 20_000,
    });
  }

  for (const viewport of [
    { width: 1280, height: 900, suffix: "1280" },
    { width: 360, height: 740, suffix: "360" },
  ] as const) {
    test(`recurrence scope prompt at ${viewport.suffix}px`, async ({
      page,
    }) => {
      await prepareParityDemoWeek(page);
      await assertPastOnboarding(page);
      await dismissIncidentalNudges(page);
      await page.setViewportSize(viewport);

      await page.evaluate(() => {
        window.__compassE2E?.showRecurrenceScopeCaptureToast?.();
      });

      const toast = page
        .locator(".Toastify__toast")
        .filter({ hasText: "Apply to series?" });
      await expect(toast).toBeVisible({ timeout: 15_000 });
      await expect(
        toast.getByRole("button", { name: "Following" }),
      ).toBeVisible();
      await expect(toast.getByRole("button", { name: "All" })).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "The Keyboard Calendar" }),
      ).toHaveCount(0);
      await expect(toast.getByText(/Changed “Write”/)).toBeVisible();

      await toast.screenshot({
        path: `${artifactDir}/recurrence-scope-prompt-${viewport.suffix}.png`,
      });
    });
  }

  test("multi-event up-next picker at 1280px", async ({ page }) => {
    await prepareParityDemoWeek(page);
    await assertPastOnboarding(page);
    await seedNudgeWindowEvents(page, 2);
    await page.setViewportSize({ width: 1280, height: 900 });

    const banner = page.locator("[data-up-next-banner]");
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner.getByText(/2 events/i)).toBeVisible();
    await banner.getByRole("button", { name: "Open" }).click();

    const picker = page.getByRole("dialog", {
      name: /Select which event to open/i,
    });
    await expect(picker).toBeVisible();
    await expect(picker).toContainText("Capture standup A");
    await expect(picker.getByText("Capture standup A")).toBeVisible();
    await expect(picker.getByText("Capture standup B")).toBeVisible();
    await assertPointerHintDoesNotOverlapMonthHeader(page);

    await page.screenshot({
      path: `${artifactDir}/up-next-multi-picker-1280.png`,
      fullPage: false,
    });
  });

  test("multi-event up-next picker at 360px", async ({ page }) => {
    await prepareParityDemoWeek(page);
    await assertPastOnboarding(page);
    await seedNudgeWindowEvents(page, 2);
    await page.setViewportSize({ width: 360, height: 740 });

    const banner = page.locator("[data-up-next-banner]");
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await banner.getByRole("button", { name: "Open" }).click();

    const picker = page.getByRole("dialog", {
      name: /Select which event to open/i,
    });
    await expect(picker).toBeVisible();
    await assertPointerHintDoesNotOverlapMonthHeader(page);

    await page.screenshot({
      path: `${artifactDir}/up-next-multi-picker-360.png`,
      fullPage: false,
    });
  });

  test("single-event up-next nudge at 360px", async ({ page }) => {
    await prepareParityDemoWeek(page);
    await assertPastOnboarding(page);
    await seedNudgeWindowEvents(page, 1);
    await page.setViewportSize({ width: 360, height: 740 });

    const banner = page.locator("[data-up-next-banner]");
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner.getByText("Capture standup A")).toBeVisible();
    await expect(banner.getByRole("button", { name: "Open" })).toBeVisible();
    await expect(page.getByRole("dialog")).toBeHidden();

    await page.screenshot({
      path: `${artifactDir}/up-next-single-nudge-360.png`,
      fullPage: false,
    });
  });
});

test.describe("contextual nudge captures (staging)", () => {
  const stagingBase =
    process.env.STAGING_BASE_URL ?? "https://staging.compasscalendar.com";

  test.skip(
    process.env.STAGING_NUDGE_CAPTURE !== "1",
    "Set STAGING_NUDGE_CAPTURE=1",
  );

  test.use({
    baseURL: stagingBase,
    storageState: { cookies: [], origins: [] },
  });

  test.beforeAll(() => {
    mkdirSync(artifactDir, { recursive: true });
  });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
      localStorage.setItem("compass.onboarding.first-event-done", "dismissed");
      localStorage.setItem(
        "compass.onboarding.has-seen-life-view-intro",
        "true",
      );
    });
  });

  test("staging build exposes version for capture report", async ({ page }) => {
    await page.goto("/week", { waitUntil: "domcontentloaded" });
    const version = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="compass:version"]');
      return meta?.getAttribute("content") ?? null;
    });
    test.info().attach("staging-version", {
      body: version ?? "unknown",
      contentType: "text/plain",
    });
  });
});
