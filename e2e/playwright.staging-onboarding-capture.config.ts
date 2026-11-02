import { defineRemoteConfig } from "./remote-config.util";

export default defineRemoteConfig({
  testMatch: "onboarding/staging-onboarding-signup-capture.spec.ts",
  timeout: 120_000,
});
