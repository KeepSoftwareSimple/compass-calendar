import { defineConfig, devices } from "@playwright/test";
import base from "../playwright.config";
import { join } from "node:path";

const TEST_PORT = 9150;
const repoRoot = process.cwd();

export default defineConfig({
  ...base,
  testDir: join(repoRoot, "e2e"),
  testMatch: [
    "onboarding/bottom-notice-stack.spec.ts",
    "onboarding/bottom-notice-capture.spec.ts",
  ],
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        storageState: { cookies: [], origins: [] },
      },
    },
  ],
  webServer: [
    {
      command: "bun run dev.ts",
      cwd: join(repoRoot, "apps/calendar-web"),
      env: {
        COMPASS_CONFIG_FILE: join(repoRoot, "e2e/compass.playwright.yaml"),
      },
      port: TEST_PORT,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
