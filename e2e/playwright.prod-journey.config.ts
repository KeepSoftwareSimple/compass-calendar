import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./journey",
  testMatch: "prod-full-journey.spec.ts",
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
  outputDir: "test-results/prod-journey",
});
