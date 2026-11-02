import { defineRemoteConfig } from "./remote-config.util";

export default defineRemoteConfig({
  testMatch: "timed/staging-event-form-fast-typing.spec.ts",
  timeout: 420_000,
});
