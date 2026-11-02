import { defineRemoteConfig, FAILURE_ARTIFACTS } from "./remote-config.util";

export default defineRemoteConfig({
  testDir: "./timed",
  testMatch: "staging-ritual-overlap-capture.spec.ts",
  timeout: 300_000,
  expectTimeout: 30_000,
  use: FAILURE_ARTIFACTS,
  outputDir: "test-results/staging-ritual-capture",
});
