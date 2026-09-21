import {
  POSTHOG_ERROR_TRACKING_PROPERTY_NAMES,
  posthogErrorTrackingSqlPropertyColumns,
} from "@core/constants/posthog-error-tracking.properties";
import { describe, expect, it } from "bun:test";

describe("POSTHOG_ERROR_TRACKING_PROPERTY", () => {
  it("lists the error-autofix SQL property names", () => {
    expect(POSTHOG_ERROR_TRACKING_PROPERTY_NAMES).toEqual([
      "environment",
      "service",
      "version",
      "namespace",
      "result",
      "errorType",
      "$exception_fingerprint",
    ]);
  });

  it("builds HogQL property columns for the autofix prompt", () => {
    expect(posthogErrorTrackingSqlPropertyColumns()).toBe(
      [
        "properties.environment",
        "properties.service",
        "properties.version",
        "properties.namespace",
        "properties.result",
        "properties.errorType",
        "properties.$exception_fingerprint",
      ].join(",\n       "),
    );
  });
});
