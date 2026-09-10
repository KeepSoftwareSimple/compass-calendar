import { AppConfigSchema } from "@core/types/config.types";
import { describe, expect, it } from "bun:test";

describe("AppConfigSchema", () => {
  it("defaults billing.publishableKey to null when the field is omitted", () => {
    const parsed = AppConfigSchema.parse({
      version: "0.5.4",
      google: { isConfigured: false },
      billing: {
        isConfigured: false,
        enforcement: false,
        trialLengthDays: 7,
      },
    });

    expect(parsed.billing.publishableKey).toBeNull();
  });

  it("derives providers from google.isConfigured when providers is omitted", () => {
    const parsed = AppConfigSchema.parse({
      version: "dev",
      google: { isConfigured: true },
    });

    expect(parsed.google.isConfigured).toBe(true);
    expect(parsed.providers).toEqual({
      google: { signIn: true, connect: true },
      microsoft: { signIn: false, connect: false },
      apple: { signIn: false, connect: false },
    });
  });
});
