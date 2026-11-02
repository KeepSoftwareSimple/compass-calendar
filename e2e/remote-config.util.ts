import {
  defineConfig,
  devices,
  type PlaywrightTestConfig,
} from "@playwright/test";

/*
 * Shared shape for the Playwright configs that drive a deployed environment
 * (staging or production) rather than the local dev server in the root
 * `playwright.config.ts`. Every one of them runs a single named spec against a
 * real deployment, so they all pin `workers: 1` and `retries: 0` and all reach
 * the same Desktop Chrome profile; only the spec, the timeouts, and where the
 * artifacts land actually differ.
 */

export const STAGING_BASE_URL =
  process.env.STAGING_BASE_URL ?? "https://staging.compasscalendar.com";

export const PROD_BASE_URL =
  process.env.PROD_BASE_URL ?? "https://compasscalendar.com";

/** Keep a failed run against a deployment diagnosable from CI artifacts alone. */
export const FAILURE_ARTIFACTS = {
  trace: "retain-on-failure",
  screenshot: "only-on-failure",
  video: "retain-on-failure",
} as const satisfies PlaywrightTestConfig["use"];

interface RemoteConfigOptions {
  /** The spec this config exists to run. */
  testMatch: string | RegExp;
  /** Whole-spec budget; these specs talk to a live deployment, so they are long. */
  timeout: number;
  testDir?: string;
  /** Defaults to staging; pass {@link PROD_BASE_URL} for a production target. */
  baseURL?: string;
  /** Omitted leaves Playwright's default assertion timeout in place. */
  expectTimeout?: number;
  outputDir?: string;
  /** Merged ahead of the device profile, e.g. {@link FAILURE_ARTIFACTS}. */
  use?: PlaywrightTestConfig["use"];
}

export function defineRemoteConfig({
  testMatch,
  timeout,
  testDir = ".",
  baseURL = STAGING_BASE_URL,
  expectTimeout,
  outputDir,
  use,
}: RemoteConfigOptions): PlaywrightTestConfig {
  return defineConfig({
    testDir,
    testMatch,
    timeout,
    ...(expectTimeout === undefined
      ? {}
      : { expect: { timeout: expectTimeout } }),
    workers: 1,
    retries: 0,
    use: {
      baseURL,
      colorScheme: "light",
      ...use,
      ...devices["Desktop Chrome"],
    },
    ...(outputDir === undefined ? {} : { outputDir }),
  });
}
