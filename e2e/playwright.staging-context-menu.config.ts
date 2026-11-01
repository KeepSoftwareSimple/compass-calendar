import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "timed/staging-context-menu-focus-capture.spec.ts",
  timeout: 120_000,
  workers: 1,
  retries: 0,
  use: {
    baseURL:
      process.env.STAGING_BASE_URL ?? "https://staging.compasscalendar.com",
    colorScheme: "light",
    ...devices["Desktop Chrome"],
  },
});
