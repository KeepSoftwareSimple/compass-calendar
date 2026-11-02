import { defineRemoteConfig } from "./remote-config.util";

export default defineRemoteConfig({
  testMatch: "timed/staging-context-menu-focus-capture.spec.ts",
  timeout: 120_000,
});
