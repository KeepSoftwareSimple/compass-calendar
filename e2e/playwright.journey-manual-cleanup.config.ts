import { defineConfig, devices } from "@playwright/test";

const baseURL =
  process.env.JOURNEY_MANUAL_CLEANUP_ENV === "production"
    ? (process.env.PROD_BASE_URL ?? "https://compasscalendar.com")
    : (process.env.STAGING_BASE_URL ?? "https://staging.compasscalendar.com");

export default defineConfig({
  testDir: "./journey",
  testMatch: "journey-manual-cleanup.spec.ts",
  timeout: 600_000,
  workers: 1,
  retries: 0,
  use: {
    baseURL,
    colorScheme: "light",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
  outputDir: "test-results/journey-manual-cleanup",
});
