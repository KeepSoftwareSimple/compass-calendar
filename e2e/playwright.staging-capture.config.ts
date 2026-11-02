import { defineRemoteConfig } from "./remote-config.util";

export default defineRemoteConfig({
  testDir: "./billing",
  testMatch: "staging-signup-trial-capture.spec.ts",
  timeout:
    process.env.STAGING_TRIAL_SUBMIT_CHECKOUT === "1" ? 600_000 : 180_000,
});
