import { buildSignInOAuthState } from "@core/auth/signin-oauth-state.util";
import {
  appleFormPostAnalytics,
  handleProviderOAuthCallback,
  parseProviderOAuthCallbackProvider,
} from "@backend/auth/services/provider-oauth-callback.service";
import * as analytics from "@backend/auth/services/provider-oauth-signup.analytics";
import { describe, expect, it, spyOn } from "bun:test";

describe("provider-oauth-callback.service", () => {
  it("parses supported providers", () => {
    expect(parseProviderOAuthCallbackProvider("google")).toBe("google");
    expect(parseProviderOAuthCallbackProvider("unknown")).toBeNull();
  });

  it("captures oauth_callback then redirects to the SPA", async () => {
    const capture = spyOn(
      analytics.providerOAuthSignupAnalytics,
      "captureCallbackQuery",
    ).mockResolvedValue(true);

    const state = buildSignInOAuthState({
      posthogDistinctId: "anon-abc",
    });

    const result = await handleProviderOAuthCallback({
      provider: "google",
      query: { state, error: "access_denied" },
      telemetryOnly: false,
      frontendUrl: "http://localhost:9080",
    });

    expect(capture).toHaveBeenCalledWith({
      provider: "google",
      state,
      code: undefined,
      providerError: "access_denied",
    });
    expect(result).toEqual({
      mode: "redirect",
      location: expect.stringContaining(
        "http://localhost:9080/auth/google/callback",
      ),
    });

    capture.mockRestore();
  });

  it("returns telemetry-only without redirect", async () => {
    const capture = spyOn(
      analytics.providerOAuthSignupAnalytics,
      "captureCallbackQuery",
    ).mockResolvedValue(true);

    const state = buildSignInOAuthState({});
    const result = await handleProviderOAuthCallback({
      provider: "microsoft",
      query: { state, code: "auth-code" },
      telemetryOnly: true,
    });

    expect(result).toEqual({ mode: "telemetry" });
    capture.mockRestore();
  });

  it("captures Apple form-post callback on the same analytics path", async () => {
    const capture = spyOn(
      analytics.providerOAuthSignupAnalytics,
      "captureCallbackQuery",
    ).mockResolvedValue(true);

    await appleFormPostAnalytics({
      state: "apple-state",
      error: "access_denied",
    });

    expect(capture).toHaveBeenCalledWith({
      provider: "apple",
      state: "apple-state",
      code: undefined,
      providerError: "access_denied",
    });

    capture.mockRestore();
  });
});
