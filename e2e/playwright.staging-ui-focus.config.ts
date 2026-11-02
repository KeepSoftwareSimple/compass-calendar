import { defineRemoteConfig } from "./remote-config.util";

export default defineRemoteConfig({
  testMatch: "timed/staging-ui-focus-capture.spec.ts",
  timeout: 300_000,
});
