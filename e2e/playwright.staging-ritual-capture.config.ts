import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./timed",
  testMatch: "staging-ritual-overlap-capture.spec.ts",
  timeout: 300_000,
  expect: {
    timeout: 30_000,
  },
  workers: 1,
  retries: 0,
  use: {
    baseURL:
      process.env.STAGING_BASE_URL ?? "https://staging.compasscalendar.com",
    colorScheme: "light",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  outputDir: "test-results/staging-ritual-capture",
});
