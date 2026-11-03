import { defineRemoteConfig, FAILURE_ARTIFACTS } from "./remote-config.util";

export default defineRemoteConfig({
  testDir: "./journey",
  testMatch: "staging-journey-cleanup-bootstrap.spec.ts",
  timeout: 300_000,
  expectTimeout: 20_000,
  use: FAILURE_ARTIFACTS,
  outputDir: "test-results/staging-journey",
});
