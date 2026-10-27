import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./billing",
  testMatch: "staging-signup-trial-capture.spec.ts",
  timeout:
    process.env.STAGING_TRIAL_SUBMIT_CHECKOUT === "1" ? 600_000 : 180_000,
  workers: 1,
  retries: 0,
  use: {
    baseURL:
      process.env.STAGING_BASE_URL ?? "https://staging.compasscalendar.com",
    colorScheme: "light",
    ...devices["Desktop Chrome"],
  },
});
