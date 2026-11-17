import {
  buildSignInOAuthState,
  parseSignInOAuthState,
  posthogDistinctIdFromSignInOAuthState,
} from "@core/auth/signin-oauth-state.util";
import { describe, expect, it } from "bun:test";

describe("signin-oauth-state", () => {
  it("round-trips posthog distinct id for web sign-in", () => {
    const state = buildSignInOAuthState({
      posthogDistinctId: "anon-123",
    });
    expect(parseSignInOAuthState(state)).toEqual({
      rawState: state,
      nonce: expect.any(String),
      posthogDistinctId: "anon-123",
      flow: "login",
    });
  });

  it("still parses legacy desktop-prefixed state", () => {
    const state = buildSignInOAuthState({
      posthogDistinctId: "anon-desktop",
    });
    const legacyDesktopState = `compass-desktop:${state}`;
    expect(parseSignInOAuthState(legacyDesktopState)?.posthogDistinctId).toBe(
      "anon-desktop",
    );
  });

  it("parses legacy uuid-only state", () => {
    const legacy = "550e8400-e29b-41d4-a716-446655440000";
    expect(parseSignInOAuthState(legacy)).toEqual({
      rawState: legacy,
      nonce: legacy,
      flow: "login",
    });
    expect(posthogDistinctIdFromSignInOAuthState(legacy)).toBeUndefined();
  });
});
