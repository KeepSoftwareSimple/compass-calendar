import {
  canReuseCompassUserByEmail,
  emailForVerifiedAccountLinkLookup,
  hasVerifiedLoginMethod,
  isApplePrivateRelayEmail,
} from "@backend/auth/services/account-linking.util";
import { describe, expect, it } from "bun:test";

describe("account-linking.util", () => {
  describe("isApplePrivateRelayEmail", () => {
    it("matches Hide My Email addresses case-insensitively", () => {
      expect(isApplePrivateRelayEmail("Abc123@PrivateRelay.AppleId.com")).toBe(
        true,
      );
      expect(isApplePrivateRelayEmail("person@gmail.com")).toBe(false);
    });
  });

  describe("emailForVerifiedAccountLinkLookup", () => {
    it("returns null for missing or relay addresses", () => {
      expect(emailForVerifiedAccountLinkLookup(null)).toBeNull();
      expect(emailForVerifiedAccountLinkLookup("  ")).toBeNull();
      expect(
        emailForVerifiedAccountLinkLookup("xyz@privaterelay.appleid.com"),
      ).toBeNull();
    });

    it("keeps a verified non-relay email", () => {
      expect(emailForVerifiedAccountLinkLookup("User@Example.com")).toBe(
        "User@Example.com",
      );
    });
  });

  describe("hasVerifiedLoginMethod", () => {
    it("is true when google.googleId or identities exist", () => {
      expect(hasVerifiedLoginMethod({ google: { googleId: "g-1" } })).toBe(
        true,
      );
      expect(
        hasVerifiedLoginMethod({
          identities: [
            {
              provider: "microsoft",
              subjectId: "ms-1",
              email: "a@example.com",
              linkedAt: new Date("2026-01-01T00:00:00.000Z"),
            },
          ],
        }),
      ).toBe(true);
      expect(hasVerifiedLoginMethod({})).toBe(false);
    });
  });

  describe("canReuseCompassUserByEmail", () => {
    it("reuses when both sides are verified or both are password-only", () => {
      expect(
        canReuseCompassUserByEmail({
          existing: { google: { googleId: "g-1" } },
          incomingHasVerifiedLogin: true,
        }),
      ).toBe(true);
      expect(
        canReuseCompassUserByEmail({
          existing: {},
          incomingHasVerifiedLogin: false,
        }),
      ).toBe(true);
    });

    it("does not mix an unverified password account with a verified login", () => {
      expect(
        canReuseCompassUserByEmail({
          existing: {},
          incomingHasVerifiedLogin: true,
        }),
      ).toBe(false);
      expect(
        canReuseCompassUserByEmail({
          existing: { google: { googleId: "g-1" } },
          incomingHasVerifiedLogin: false,
        }),
      ).toBe(false);
    });
  });
});
