import { expect, test } from "@playwright/test";
import {
  installParityWebEnvironment,
  PARITY_VIEWPORT,
  prepareParityDemoWeek,
} from "./seed-demo-fixture.util";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const outputDir =
  process.env.PARITY_WEB_OUT ??
  join(process.cwd(), "build", "desktop-parity", "web");

const macChromeUserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** Parity captures use a Mac Chrome UA so Mod renders as ⌘ like native macOS. */
const modKey = "Meta";

test.use({
  viewport: PARITY_VIEWPORT,
  storageState: { cookies: [], origins: [] },
  timezoneId: "UTC",
  colorScheme: "light",
  userAgent: macChromeUserAgent,
});

test.describe("Desktop web parity captures", () => {
  test.beforeAll(() => {
    mkdirSync(outputDir, { recursive: true });
  });

  test.beforeEach(async ({ page }, testInfo) => {
    if (testInfo.title === "onboarding-welcome") return;
    await installParityWebEnvironment(page);
  });

  test("week-grid", async ({ page }) => {
    await prepareParityDemoWeek(page);
    await page.screenshot({ path: join(outputDir, "week-grid.png") });
  });

  test("week-grid-allday", async ({ page }) => {
    await prepareParityDemoWeek(page);
    await page.locator("#allDayRow").scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(outputDir, "week-grid-allday.png") });
  });

  test("demo-events-banner", async ({ page }) => {
    await prepareParityDemoWeek(page, { dismissDemoBanner: false });
    const banner = page
      .getByRole("status")
      .filter({ hasText: "Sample events to help you explore" });
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: join(outputDir, "demo-events-banner.png") });
  });

  test("mod-hold-overlay", async ({ page }) => {
    await prepareParityDemoWeek(page);
    await page.locator("#mainGrid").focus();
    await page.keyboard.down(modKey);
    await expect(page.locator("[data-page-jump-hints]")).toBeVisible({
      timeout: 2_000,
    });
    await page.screenshot({ path: join(outputDir, "mod-hold-overlay.png") });
    await page.keyboard.up(modKey);
  });

  test("up-next-banner", async ({ page }) => {
    await prepareParityDemoWeek(page);
    await expect(page.getByRole("region", { name: /up next/i })).toBeVisible({
      timeout: 15_000,
    });
    await page.screenshot({ path: join(outputDir, "up-next-banner.png") });
  });

  test("mini-calendar", async ({ page }) => {
    await prepareParityDemoWeek(page);
    await page.keyboard.press("i");
    await expect(page.getByTestId("Month picker")).toBeVisible({
      timeout: 10_000,
    });
    await page.screenshot({ path: join(outputDir, "mini-calendar.png") });
  });

  test("event-form", async ({ page }) => {
    await prepareParityDemoWeek(page);
    await page.locator("#mainGrid").focus();
    await page.keyboard.press("c");
    await expect(page.getByLabel(/^title$/i)).toBeVisible({
      timeout: 10_000,
    });
    await page.screenshot({ path: join(outputDir, "event-form.png") });
  });

  test("event-form-date-picker", async ({ page }) => {
    await prepareParityDemoWeek(page);
    await page.locator("#mainGrid").focus();
    await page.keyboard.press("c");
    await page.locator("#eventFormStartDate").click();
    await expect(page.locator(".react-datepicker")).toBeVisible({
      timeout: 10_000,
    });
    await page.screenshot({
      path: join(outputDir, "event-form-date-picker.png"),
    });
  });

  test("event-form-time-picker", async ({ page }) => {
    await prepareParityDemoWeek(page);
    await page.locator("#mainGrid").focus();
    await page.keyboard.press("c");
    await page.locator("#startTimePicker").click();
    await page.screenshot({
      path: join(outputDir, "event-form-time-picker.png"),
    });
  });

  test("event-form-meeting-link", async ({ page }) => {
    await prepareParityDemoWeek(page);
    await page.getByRole("button", { name: "Morning standup" }).click();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("link", { name: "Google Meet" })).toBeVisible({
      timeout: 10_000,
    });
    await page.screenshot({
      path: join(outputDir, "event-form-meeting-link.png"),
    });
  });

  test("command-palette", async ({ page }) => {
    await prepareParityDemoWeek(page);
    await page.keyboard.press(`${modKey}+K`);
    await expect(page.getByLabel("Command palette search")).toBeVisible({
      timeout: 10_000,
    });
    await page.screenshot({
      path: join(outputDir, "command-palette.png"),
      animations: "disabled",
    });
  });

  test("settings", async ({ page }) => {
    await prepareParityDemoWeek(page);
    await page.keyboard.press(`${modKey}+,`);
    await expect(page.getByRole("button", { name: "Accounts" })).toBeVisible({
      timeout: 10_000,
    });
    await page.screenshot({ path: join(outputDir, "settings.png") });
  });

  test("onboarding-welcome", async ({ page }) => {
    await installParityWebEnvironment(page, { dismissOnboarding: false });
    await page.goto("/week", { waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("dialog", { name: "Welcome to Compass Calendar" }),
    ).toBeVisible({ timeout: 15_000 });
    await page.screenshot({ path: join(outputDir, "onboarding-welcome.png") });
  });
});
