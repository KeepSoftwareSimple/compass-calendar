import {
  defineRemoteConfig,
  FAILURE_ARTIFACTS,
  PROD_BASE_URL,
} from "./remote-config.util";

export default defineRemoteConfig({
  testDir: "./journey",
  testMatch: /prod-(full-journey|journey-cleanup)\.spec\.ts/,
  timeout: 600_000,
  expectTimeout: 180_000,
  baseURL: PROD_BASE_URL,
  use: FAILURE_ARTIFACTS,
  // Playwright empties outputDir on start. The workflow's fallback cleanup run
  // must not wipe the failed leg's traces or its journey-pending-account.json.
  outputDir:
    process.env.PROD_JOURNEY_CLEANUP_FALLBACK === "1"
      ? "test-results/prod-journey-fallback"
      : "test-results/prod-journey",
});
