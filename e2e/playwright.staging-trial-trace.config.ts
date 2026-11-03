import { defineRemoteConfig } from "./remote-config.util";

export default defineRemoteConfig({
  testDir: "./billing",
  testMatch: "staging-first-event-trial-trace.spec.ts",
  timeout: 180_000,
});
