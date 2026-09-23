import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";

const TEST_PORT = 9150;
const BOOKING_WEB_PORT = 9151;
const TEST_CONFIG_PATH = join(process.cwd(), "e2e/compass.playwright.yaml");

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
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
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        storageState: {
          cookies: [],
          origins: [
            {
              origin: `http://localhost:${TEST_PORT}`,
              localStorage: [
                { name: "compass.onboarding.has-seen-welcome", value: "true" },
                // Generic calendar specs are not testing first-event handoff;
                // without this, the prompt wins the onboarding surface over
                // pointer hints for users who never opted into Block Party.
                {
                  name: "compass.onboarding.first-event-done",
                  value: "dismissed",
                },
              ],
            },
          ],
        },
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
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: "cd packages/web && bun run dev.ts",
      env: {
        BOOKING_WEB_PORT: String(BOOKING_WEB_PORT),
        COMPASS_CONFIG_FILE: TEST_CONFIG_PATH,
      },
      port: TEST_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
