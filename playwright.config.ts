import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";

const TEST_PORT = 9150;
const STAGING_SIDEBAR_PORT = 9152;
const BOOKING_WEB_PORT = 9151;
const TEST_CONFIG_PATH = join(process.cwd(), "e2e/compass.playwright.yaml");
const STAGING_SIDEBAR_CONFIG_PATH = join(
  process.cwd(),
  "e2e/compass.playwright.staging-sidebar.yaml",
);
const STAGING_SIDEBAR_BUILD_OUTDIR = join(
  process.cwd(),
  "build/web-e2e-staging-sidebar",
);

const onboardingStorageState = (origin: string) => ({
  cookies: [] as [],
  origins: [
    {
      origin,
      localStorage: [
        { name: "compass.onboarding.has-seen-welcome", value: "true" },
        {
          name: "compass.onboarding.first-event-done",
          value: "dismissed",
        },
      ],
    },
  ],
});

const ciReporters: [string, { outputFile: string }][] = [
  ["json", { outputFile: "test-results/playwright-report.json" }],
];

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [["list"], ...ciReporters] : "list",
  // Two workers share one dev server and the CI container's 2 vCPUs; running
  // both browsers concurrently there causes React renders/saves to blow
  // through assertion timeouts under load (different spec each time). Serial
  // in CI trades ~1.5min of wall time for eliminating that contention.
  workers: process.env.CI ? 1 : 2,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: `http://localhost:${TEST_PORT}`,
    // Product default is Light Beach. Specs that need Dark Abyss set
    // compass.theme in localStorage.
    colorScheme: "light",
    timezoneId: "UTC",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium-desktop",
      testIgnore: [
        "**/event-sidebar-staging.spec.ts",
        "**/event-description-links.spec.ts",
      ],
      use: {
        ...devices["Desktop Chrome"],
        storageState: onboardingStorageState(`http://localhost:${TEST_PORT}`),
      },
    },
    {
      name: "chromium-staging-sidebar",
      testMatch: [
        "**/event-sidebar-staging.spec.ts",
        "**/event-description-links.spec.ts",
      ],
      use: {
        ...devices["Desktop Chrome"],
        baseURL: `http://localhost:${STAGING_SIDEBAR_PORT}`,
        storageState: onboardingStorageState(
          `http://localhost:${STAGING_SIDEBAR_PORT}`,
        ),
      },
    },
  ],
  webServer: [
    {
      command: "cd apps/booking-web && bun run dev.ts",
      env: {
        BOOKING_WEB_PORT: String(BOOKING_WEB_PORT),
        COMPASS_CONFIG_FILE: TEST_CONFIG_PATH,
      },
      port: BOOKING_WEB_PORT,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "cd apps/calendar-web && bun run dev.ts",
      env: {
        BOOKING_WEB_PORT: String(BOOKING_WEB_PORT),
        COMPASS_CONFIG_FILE: TEST_CONFIG_PATH,
      },
      port: TEST_PORT,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "cd apps/calendar-web && bun run dev.ts",
      env: {
        BOOKING_WEB_PORT: String(BOOKING_WEB_PORT),
        COMPASS_CONFIG_FILE: STAGING_SIDEBAR_CONFIG_PATH,
        WEB_BUILD_OUTDIR: STAGING_SIDEBAR_BUILD_OUTDIR,
      },
      port: STAGING_SIDEBAR_PORT,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
