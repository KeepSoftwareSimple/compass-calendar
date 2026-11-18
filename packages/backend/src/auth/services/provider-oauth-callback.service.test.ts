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

  it("records nothing and redirects home when the callback query is empty", async () => {
    const capture = spyOn(
      analytics.providerOAuthSignupAnalytics,
      "captureCallbackQuery",
    ).mockResolvedValue(true);

    const result = await handleProviderOAuthCallback({
      provider: "apple",
      query: {},
      telemetryOnly: false,
      frontendUrl: "http://localhost:9080",
    });

    expect(capture).not.toHaveBeenCalled();
    expect(result).toEqual({
      mode: "redirect",
      location: "http://localhost:9080/",
    });

    const telemetryOnly = await handleProviderOAuthCallback({
      provider: "google",
      query: {},
      telemetryOnly: true,
    });
    expect(capture).not.toHaveBeenCalled();
    expect(telemetryOnly).toEqual({ mode: "telemetry" });

    capture.mockRestore();
  });

  it("records nothing for a whitespace-only state instead of missing_code", async () => {
    const capture = spyOn(
      analytics.providerOAuthSignupAnalytics,
      "captureCallbackQuery",
    ).mockResolvedValue(true);

    // A blank param is junk traffic, not a real callback: before the emptiness
    // rule trimmed, this captured an `oauth_callback` failure of missing_code.
    const result = await handleProviderOAuthCallback({
      provider: "google",
      query: { state: " " },
      telemetryOnly: false,
      frontendUrl: "http://localhost:9080",
    });

    expect(capture).not.toHaveBeenCalled();
    expect(result).toEqual({
      mode: "redirect",
      location: "http://localhost:9080/",
    });

    capture.mockRestore();
  });

  it("still records failures when state is present without a code", async () => {
    const capture = spyOn(
      analytics.providerOAuthSignupAnalytics,
      "captureCallbackQuery",
    ).mockResolvedValue(true);

    const state = buildSignInOAuthState({});
    await handleProviderOAuthCallback({
      provider: "google",
      query: { state },
      telemetryOnly: false,
    });

    expect(capture).toHaveBeenCalledWith({
      provider: "google",
      state,
      code: undefined,
      providerError: null,
    });

    capture.mockRestore();
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
