import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./billing",
  testMatch: "staging-first-event-trial-trace.spec.ts",
  timeout: 180_000,
  workers: 1,
  retries: 0,
  use: {
    baseURL:
      process.env.STAGING_BASE_URL ?? "https://staging.compasscalendar.com",
    colorScheme: "light",
    ...devices["Desktop Chrome"],
  },
});
