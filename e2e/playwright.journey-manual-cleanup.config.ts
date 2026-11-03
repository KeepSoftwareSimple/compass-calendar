import {
  defineRemoteConfig,
  PROD_BASE_URL,
  STAGING_BASE_URL,
} from "./remote-config.util";

export default defineRemoteConfig({
  testDir: "./journey",
  testMatch: "journey-manual-cleanup.spec.ts",
  timeout: 600_000,
  baseURL:
    process.env.JOURNEY_MANUAL_CLEANUP_ENV === "production"
      ? PROD_BASE_URL
      : STAGING_BASE_URL,
  // No video: this run only confirms a deletion, and the trace plus the
  // failure screenshot already show it.
  use: { trace: "retain-on-failure", screenshot: "only-on-failure" },
  outputDir: "test-results/journey-manual-cleanup",
});
