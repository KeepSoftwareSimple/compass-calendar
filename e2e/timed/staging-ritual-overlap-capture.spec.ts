import { expect, type Page, test } from "@playwright/test";
import { COMPASS_SYNTHETIC_ACCOUNT_HEADER } from "@core/analytics/synthetic-account.util";
import { seedJourneyOnboarding } from "../journey/journey-leg.util";
import { seedStagingProdOverlapEvents } from "../overlap/staging-prod-overlap-seed.util";
import {
  dismissBringYourEventsPromptIfOpen,
  dismissExploreTrialBannerIfOpen,
  ensureSidebarOpen,
  getEventFormTitleInput,
  waitForWritableCalendarsReady,
} from "../utils/event-test-utils";
import { mkdirSync, writeFileSync } from "node:fs";

const ARTIFACT_DIR = "/opt/cursor/artifacts/staging-ritual-overlap";
const DENVER = "America/Denver";
const baseUrl =
  process.env.STAGING_BASE_URL ?? "https://staging.compasscalendar.com";

test.use({ storageState: { cookies: [], origins: [] } });
test.use({
  extraHTTPHeaders: {
    [COMPASS_SYNTHETIC_ACCOUNT_HEADER]: "true",
  },
});
test.use({ timezoneId: DENVER });

const signUpSyntheticJourneyAccount = async (page: Page) => {
  const email = `ritual.capture+journey${Date.now()}@compasscaltest.invalid`;
  await page.goto(`${baseUrl}/week?auth=signup`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByLabel("Name").fill("Ritual Overlap Capture");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("CompassStagingRitualCap1!");
  await page.getByRole("button", { name: "Sign up" }).click();
  await expect(page.getByLabel("Password")).toHaveCount(0, {
    timeout: 120_000,
  });
  writeFileSync(`${ARTIFACT_DIR}/synthetic-email.txt`, `${email}\n`);
};

const pinDenverAndOnboarding = async (page: Page) => {
  await page.addInitScript((timeZone) => {
    localStorage.setItem("compass.onboarding.has-seen-welcome", "true");
    localStorage.setItem(
      "compass.onboarding.has-seen-shortcut-showcase",
      "true",
    );
    localStorage.setItem("compass.onboarding.first-event-done", "dismissed");
    localStorage.setItem("compass.onboarding.has-seen-life-view-intro", "true");
    localStorage.setItem("compass.view.sidebar-open", "true");
    localStorage.setItem("compass.timezone.default", timeZone);
    localStorage.setItem(
      "compass.onboarding.has-dismissed-connect-calendar-prompt",
      String(Date.now()),
    );
  }, DENVER);
};

const assertOverlapStacking = async (page: Page, selectedTitle: RegExp) => {
  const metrics = await page.evaluate((patternSource) => {
    const pattern = new RegExp(patternSource, "i");
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>("#mainGrid button"),
    ).filter((node) => pattern.test(node.textContent ?? ""));

    const active = document.activeElement;
    return cards.map((node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        text: (node.textContent ?? "").trim().slice(0, 40),
        zIndex: style.zIndex,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
        isActive: node === active,
      };
    });
  }, selectedTitle.source);

  const rituals = metrics.filter((m) => /monthly ritual/i.test(m.text));
  expect(rituals.length).toBeGreaterThanOrEqual(2);

  const selected = rituals.find((m) => m.isActive) ?? rituals[0];
  const other = rituals.find((m) => m !== selected);
  expect(selected).toBeDefined();
  expect(other).toBeDefined();

  const selectedZ = Number.parseInt(selected!.zIndex, 10);
  const otherZ = Number.parseInt(other!.zIndex, 10);
  expect(selectedZ).toBeGreaterThan(otherZ);

  const overlapWidth =
    Math.min(selected!.right, other!.right) -
    Math.max(selected!.left, other!.left);
  const obscuredWidth = Math.max(0, overlapWidth);
  expect(obscuredWidth).toBeLessThan(other!.width * 0.95);
};

const captureAtWidth = async (page: Page, width: number) => {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(`${baseUrl}/week/2026-10-31`, {
    waitUntil: "domcontentloaded",
  });
  await dismissExploreTrialBannerIfOpen(page);
  await ensureSidebarOpen(page);
  await page
    .locator("#mainGrid")
    .waitFor({ state: "visible", timeout: 60_000 });
  await page
    .getByRole("option", { name: /October 31(st)?, 2026/i })
    .click({ timeout: 15_000 })
    .catch(() => undefined);
  await page
    .getByRole("region", { name: "Week calendar horizontal scroll area" })
    .evaluate((node) => {
      node.scrollLeft = node.scrollWidth;
    });

  const ritualButton = page
    .getByRole("button", { name: /monthly ritual/i })
    .first();
  await expect(ritualButton).toBeVisible({ timeout: 60_000 });
  await ritualButton.focus();
  await page.keyboard.press("Enter");
  const titleInput = getEventFormTitleInput(page);
  await expect(titleInput).toHaveValue(/monthly ritual/i);
  await expect(page.getByRole("combobox", { name: "Start time" })).toHaveText(
    "12 PM",
  );
  await expect(page.getByRole("combobox", { name: "End time" })).toHaveText(
    "1:30 PM",
  );
  await expect(page.getByText("7 - 8:30 PM Berlin")).toBeVisible();

  await assertOverlapStacking(page, /monthly ritual/i);

  await page.screenshot({
    path: `${ARTIFACT_DIR}/ritual-form-overlap-${width}.png`,
    fullPage: width <= 360,
  });
};

test.describe("staging ritual overlap capture", () => {
  test("monthly ritual form and deck stacking on Oct 31", async ({ page }) => {
    test.skip(
      process.env.STAGING_RITUAL_OVERLAP_CAPTURE !== "1",
      "Set STAGING_RITUAL_OVERLAP_CAPTURE=1 to run against staging",
    );

    mkdirSync(ARTIFACT_DIR, { recursive: true });

    await pinDenverAndOnboarding(page);
    await seedJourneyOnboarding(page, { snoozeConnectPrompt: true });
    await signUpSyntheticJourneyAccount(page);
    await dismissBringYourEventsPromptIfOpen(page);
    await dismissExploreTrialBannerIfOpen(page);
    await waitForWritableCalendarsReady(page);

    await seedStagingProdOverlapEvents(page.request, baseUrl);

    const versionResponse = await page.request.get(`${baseUrl}/version.json`);
    expect(versionResponse.ok()).toBe(true);
    const version = (await versionResponse.json()) as { version?: string };
    writeFileSync(
      `${ARTIFACT_DIR}/staging-version.txt`,
      `${version.version ?? "unknown"}\n`,
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await dismissExploreTrialBannerIfOpen(page);

    await captureAtWidth(page, 1280);
    await captureAtWidth(page, 360);
  });
});
