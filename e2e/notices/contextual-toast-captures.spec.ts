import { expect, type Page, test } from "@playwright/test";
import { COMPASS_SYNTHETIC_ACCOUNT_HEADER } from "@core/analytics/synthetic-account.util";
import {
  seedJourneyOnboarding,
  signUpJourneyAccount,
  uniqueJourneyEmail,
} from "../journey/journey-leg.util";
import {
  installParityWebEnvironment,
  prepareParityDemoWeek,
} from "../parity/seed-demo-fixture.util";
import { mkdirSync, writeFileSync } from "node:fs";

const artifactDir = process.env.NUDGE_CAPTURE_OUT ?? "/opt/cursor/artifacts";

const localCaptureEnabled = process.env.NUDGE_CAPTURE === "1";
const stagingCaptureEnabled = process.env.STAGING_NUDGE_CAPTURE === "1";

const contextualToasts = [
  {
    slug: "conference-link-added",
    trigger: "showConferenceLinkAddedCaptureToast",
    match: "Google Meet link added",
    action: /Copy link/,
  },
  {
    slug: "guest-rsvp",
    trigger: "showGuestRsvpCaptureToast",
    match: "Alex Guest accepted",
    action: /^Show$/,
  },
  {
    slug: "new-meetings",
    trigger: "showNewMeetingsCaptureToast",
    match: "Jamie Guest booked a meeting",
    action: /^Show$/,
  },
  {
    slug: "shortcut-upgrade",
    trigger: "showShortcutUpgradeCaptureToast",
    match: "Premium unlocks it",
    action: /Start trial/,
  },
] as const;

async function assertContextualToastAction(toast: ReturnType<Page["locator"]>) {
  const action = toast.getByRole("button").first();
  await expect(action).toBeVisible();
  const className = await action.evaluate((node) => node.className);
  expect(className).toContain("bg-accent-secondary");
  expect(className).not.toContain("c-button-primary");
}

async function captureContextualToast(
  page: Page,
  config: (typeof contextualToasts)[number],
  suffix: string,
) {
  await page.evaluate((trigger) => {
    const helpers = window.__compassE2E as Record<
      string,
      (() => void) | undefined
    >;
    helpers[trigger]?.();
  }, config.trigger);

  const toast = page
    .locator(".Toastify__toast")
    .filter({ hasText: config.match });
  await expect(toast).toBeVisible({ timeout: 15_000 });
  await expect(
    toast.getByRole("button", { name: config.action }),
  ).toBeVisible();
  await assertContextualToastAction(toast);

  await toast.screenshot({
    path: `${artifactDir}/${config.slug}-toast-${suffix}.png`,
  });
}

test.describe("contextual toast captures (local parity)", () => {
  test.skip(!localCaptureEnabled, "Set NUDGE_CAPTURE=1");

  test.beforeAll(() => {
    mkdirSync(artifactDir, { recursive: true });
  });

  test.beforeEach(async ({ page }) => {
    await installParityWebEnvironment(page);
  });

  for (const viewport of [
    { width: 1280, height: 900, suffix: "1280" },
    { width: 360, height: 740, suffix: "360" },
  ] as const) {
    for (const toastConfig of contextualToasts) {
      test(`${toastConfig.slug} toast at ${viewport.suffix}px`, async ({
        page,
      }) => {
        await prepareParityDemoWeek(page);
        await page.setViewportSize(viewport);
        await captureContextualToast(page, toastConfig, viewport.suffix);
      });
    }
  }
});

test.describe("contextual toast captures (staging)", () => {
  const stagingBase =
    process.env.STAGING_BASE_URL ?? "https://staging.compasscalendar.com";

  test.skip(!stagingCaptureEnabled, "Set STAGING_NUDGE_CAPTURE=1");

  test.use({
    baseURL: stagingBase,
    storageState: { cookies: [], origins: [] },
    extraHTTPHeaders: {
      [COMPASS_SYNTHETIC_ACCOUNT_HEADER]: "true",
    },
  });

  test.beforeAll(() => {
    mkdirSync(artifactDir, { recursive: true });
  });

  async function signUpSyntheticCaptureAccount(page: Page) {
    await seedJourneyOnboarding(page, { snoozeConnectPrompt: true });
    const email = uniqueJourneyEmail("capture+journey@compasscaltest.invalid");
    await signUpJourneyAccount(page, {
      name: "Contextual Toast Capture",
      email,
      password: "CompassStagingCapture1!",
    });
    await page
      .locator("#mainGrid")
      .waitFor({ state: "visible", timeout: 120_000 });
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const helpers = window.__compassE2E as
              | Record<string, unknown>
              | undefined;
            return (
              typeof helpers?.showConferenceLinkAddedCaptureToast === "function"
            );
          }),
        { timeout: 60_000 },
      )
      .toBe(true);
  }

  async function readStagingVersion(page: Page): Promise<string> {
    const version = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="compass:version"]');
      return meta?.getAttribute("content") ?? "unknown";
    });
    writeFileSync(
      `${artifactDir}/staging-contextual-toast-version.txt`,
      version,
    );
    return version;
  }

  for (const viewport of [
    { width: 1280, height: 900, suffix: "1280" },
    { width: 360, height: 740, suffix: "360" },
  ] as const) {
    for (const toastConfig of contextualToasts) {
      test(`staging ${toastConfig.slug} toast at ${viewport.suffix}px`, async ({
        page,
      }) => {
        await signUpSyntheticCaptureAccount(page);
        await readStagingVersion(page);
        await page.setViewportSize(viewport);
        await captureContextualToast(page, toastConfig, viewport.suffix);
      });
    }
  }
});
