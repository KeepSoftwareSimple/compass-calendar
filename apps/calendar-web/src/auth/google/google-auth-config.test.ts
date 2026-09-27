import { describe, expect, it } from "bun:test";

process.env.PORT ??= "3000";

const { isGoogleAuthConfigured } = await import("./google-auth-config");

describe("isGoogleAuthConfigured", () => {
  it("rejects missing or empty Google client IDs", () => {
    expect(isGoogleAuthConfigured()).toBe(false);
    expect(isGoogleAuthConfigured("")).toBe(false);
    expect(isGoogleAuthConfigured("undefined")).toBe(false);
  });

  it("accepts a custom Google client ID", () => {
    expect(
      isGoogleAuthConfigured("1234567890-example.apps.googleusercontent.com"),
    ).toBe(true);
  });
});
