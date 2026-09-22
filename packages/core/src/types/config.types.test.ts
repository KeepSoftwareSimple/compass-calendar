import { AppConfigSchema } from "@core/types/config.types";
import { describe, expect, it } from "bun:test";

describe("AppConfigSchema", () => {
  it("defaults billing.publishableKey to null when the field is omitted", () => {
    const parsed = AppConfigSchema.parse({
      version: "0.5.4",
      providers: {
        google: { signIn: false, connect: false },
        microsoft: { signIn: false, connect: false },
        apple: { signIn: false, connect: false },
      },
      billing: {
        isConfigured: false,
        enforcement: false,
        trialLengthDays: 7,
      },
    });

    expect(parsed.billing.publishableKey).toBeNull();
  });

  it("parses provider flags from the wire payload", () => {
    const parsed = AppConfigSchema.parse({
      version: "dev",
      providers: {
        google: { signIn: true, connect: true },
        microsoft: { signIn: false, connect: false },
        apple: { signIn: false, connect: false },
      },
    });

    expect(parsed.providers.google).toEqual({ signIn: true, connect: true });
  });
});
