import { defineRemoteConfig } from "./remote-config.util";

export default defineRemoteConfig({
  testMatch: "onboarding/staging-first-event-prompt-capture.spec.ts",
  timeout: 120_000,
});
