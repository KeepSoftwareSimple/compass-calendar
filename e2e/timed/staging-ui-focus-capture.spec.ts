import { expect, type Page, test } from "@playwright/test";
import { seedJourneyOnboarding } from "../journey/journey-leg.util";
import {
  ensureSidebarOpen,
  waitForWeekEventsLoaded,
} from "../utils/event-test-utils";
import { mkdirSync, writeFileSync } from "node:fs";

const ARTIFACT_DIR = "/opt/cursor/artifacts/staging-ui-focus";
const baseUrl =
  process.env.STAGING_BASE_URL ?? "https://staging.compasscalendar.com";

const seedOnboarding = async (page: Page) => {
  await seedJourneyOnboarding(page, { snoozeConnectPrompt: true });
  await page.addInitScript(() => {
    localStorage.setItem("compass.onboarding.has-seen-life-view-intro", "true");
    localStorage.setItem("compass.view.sidebar-open", "true");
  });
};

const signUpSyntheticAccount = async (page: Page) => {
  await page.goto(`${baseUrl}/week?auth=signup`, {
    waitUntil: "domcontentloaded",
  });
  const email = `agent.ui-focus.${Date.now()}@compasscaltest.invalid`;
  await page.getByLabel("Name").fill("UI Focus Capture");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("CompassStagingUiFocus1!");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByLabel("Password")).toHaveCount(0, {
    timeout: 120_000,
  });
  await page
    .locator("#mainGrid")
    .waitFor({ state: "visible", timeout: 60_000 });

  const trialBanner = page.getByRole("status").filter({
    hasText: "Start your 7-day free trial to plan your week.",
  });
  if (await trialBanner.isVisible().catch(() => false)) {
    await trialBanner.getByRole("button", { name: "Dismiss" }).click();
  }
};

const dismissTrialBanner = async (page: Page) => {
  const trialBanner = page.getByRole("status").filter({
    hasText: "Start your 7-day free trial to plan your week.",
  });
  if (await trialBanner.isVisible().catch(() => false)) {
    await trialBanner.getByRole("button", { name: "Dismiss" }).click();
    await expect(trialBanner).toBeHidden({ timeout: 10_000 });
  }
  const meetingDismiss = page
    .getByRole("region", { name: "Meeting page" })
    .getByRole("button", { name: "Dismiss" });
  if (await meetingDismiss.isVisible().catch(() => false)) {
    await meetingDismiss.click();
  }
};

const waitForSidebarIdle = async (page: Page) => {
  await expect
    .poll(() => page.locator("#sidebar [aria-busy='true']").count(), {
      timeout: 60_000,
    })
    .toBe(0);
};

const expectFocusReturnedToWeekGrid = async (page: Page) => {
  const pickerDay = page.locator('.react-datepicker__day[tabindex="0"]');
  await expect(pickerDay).not.toBeFocused({ timeout: 15_000 });

  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const active = document.activeElement;
          if (!active) return false;
          const grid = document.getElementById("mainGrid");
          const week = document.querySelector(
            '[aria-label="Week calendar horizontal scroll area"]',
          );
          return (
            active === grid ||
            Boolean(grid?.contains(active)) ||
            Boolean(week?.contains(active))
          );
        }),
      { timeout: 15_000 },
    )
    .toBe(true);
};

const captureWeekFocusSequence = async (
  page: Page,
  width: number,
  height: number,
) => {
  await page.setViewportSize({ width, height });
  await page.goto(`${baseUrl}/week`, { waitUntil: "domcontentloaded" });
  await dismissTrialBanner(page);
  await ensureSidebarOpen(page);
  await waitForSidebarIdle(page);
  await waitForWeekEventsLoaded(page);
  await page.locator("#mainGrid").focus();

  await expect(page.locator("#mainGrid")).toBeFocused();
  await expect(page.getByTestId("grid-focus-indicator")).toBeVisible();
  await page.screenshot({
    path: `${ARTIFACT_DIR}/week-grid-focused-${width}.png`,
  });
  await page
    .getByRole("region", { name: "Week calendar horizontal scroll area" })
    .click({ position: { x: 80, y: 120 } });
  await expect(page.locator("#mainGrid")).toBeFocused();
  await page.keyboard.press("i");
  const focusedPickerDay = page.locator(".react-datepicker__day:focus");
  await expect(focusedPickerDay).toBeVisible({ timeout: 10_000 });
  const weekFocusRing = await focusedPickerDay.evaluate((el) => {
    const row = el.closest(".react-datepicker__week");
    if (!row) return null;
    return getComputedStyle(row, "::after").boxShadow;
  });
  expect(weekFocusRing).toMatch(/inset/);
  const pickerDay = page.locator('.react-datepicker__day[tabindex="0"]');
  await page.screenshot({
    path: `${ARTIFACT_DIR}/week-month-picker-after-i-${width}.png`,
  });
  await pickerDay.focus();

  await page.keyboard.press("u");
  await expectFocusReturnedToWeekGrid(page);
  await expect(page.locator("#mainGrid")).toBeFocused();
  await expect(page.getByTestId("grid-focus-indicator")).toBeVisible();
  await page.screenshot({
    path: `${ARTIFACT_DIR}/week-grid-after-u-${width}.png`,
  });
};

const captureLifeAfterI = async (page: Page, width: number, height: number) => {
  await page.setViewportSize({ width, height });
  await page.goto(`${baseUrl}/life`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Life" })).toBeVisible();
  await waitForSidebarIdle(page);

  const currentWeek = page.getByRole("button", { name: /current week/i });
  if (await currentWeek.count()) {
    await currentWeek.first().focus();
  } else {
    await page.locator('[data-page-jump="life-grid"]').first().focus();
  }

  const birthDate = page.getByRole("textbox", { name: "Date of birth" });
  await page.keyboard.press("i");
  await expect(birthDate).toBeFocused();
  await expect(birthDate).toHaveValue("Jan 1, 2000");

  await page.screenshot({
    path: `${ARTIFACT_DIR}/life-after-i-${width}.png`,
    fullPage: width <= 360,
  });
};

test.describe("staging ui focus capture", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("week and life u/i focus rings", async ({ page }) => {
    test.setTimeout(600_000);
    test.skip(
      process.env.STAGING_UI_FOCUS_CAPTURE !== "1",
      "Set STAGING_UI_FOCUS_CAPTURE=1 to run against staging",
    );

    mkdirSync(ARTIFACT_DIR, { recursive: true });

    await seedOnboarding(page);
    await signUpSyntheticAccount(page);

    const versionResponse = await page.request.get(`${baseUrl}/version.json`);
    expect(versionResponse.ok()).toBe(true);
    const version = (await versionResponse.json()) as { version?: string };
    writeFileSync(
      `${ARTIFACT_DIR}/staging-version.txt`,
      `${version.version ?? "unknown"}\n`,
    );

    const widthOnly = process.env.STAGING_UI_FOCUS_WIDTH;
    if (!widthOnly || widthOnly === "1280") {
      await captureWeekFocusSequence(page, 1280, 800);
    }
    if (!widthOnly || widthOnly === "360") {
      await captureWeekFocusSequence(page, 360, 800);
    }
    if (!widthOnly) {
      await captureLifeAfterI(page, 1280, 800);
      await captureLifeAfterI(page, 360, 800);
    }
  });
});
