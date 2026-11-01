import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./journey",
  testMatch: /prod-(full-journey|journey-cleanup)\.spec\.ts/,
  timeout: 600_000,
  expect: {
    timeout: 180_000,
  },
  workers: 1,
  retries: 0,
  use: {
    baseURL: process.env.PROD_BASE_URL ?? "https://compasscalendar.com",
    colorScheme: "light",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  // Playwright empties outputDir on start. The workflow's fallback cleanup run
  // must not wipe the failed leg's traces or its journey-pending-account.json.
  outputDir:
    process.env.PROD_JOURNEY_CLEANUP_FALLBACK === "1"
      ? "test-results/prod-journey-fallback"
      : "test-results/prod-journey",
});
