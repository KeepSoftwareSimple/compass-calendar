import { describe, expect, it } from "bun:test";

const { isGoogleAuthConfigured } = await import("./google-auth-config");

describe("isGoogleAuthConfigured", () => {
  it("returns false when client id is missing or the literal undefined", () => {
    expect(isGoogleAuthConfigured(undefined)).toBe(false);
    expect(isGoogleAuthConfigured("undefined")).toBe(false);
  });

  it("returns true when a real client id is present", () => {
    expect(isGoogleAuthConfigured("abc")).toBe(true);
  });
});
