import { OAUTH_CALLBACK_EVENT } from "@core/analytics/oauth-signup.events";
import { buildSignInOAuthState } from "@core/auth/signin-oauth-state.util";
import { mockEnv } from "@backend/__tests__/helpers/mock.setup";
import { encodeAppleOAuthState } from "@backend/auth/services/apple/apple.auth.callback";
import { providerOAuthSignupAnalytics } from "@backend/auth/services/provider-oauth-signup.analytics";
import { CONFIG } from "@backend/common/constants/config.constants";
import { describe, expect, it } from "bun:test";

describe("provider-oauth-signup.analytics", () => {
  it("captures oauth_callback with anon distinct id and signup flow", async () => {
    const captured: unknown[] = [];
    using _env = mockEnv({
      POSTHOG_KEY: "phc_test",
      POSTHOG_HOST: "https://ph.example.test",
      NODE_ENV: "staging",
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_input, init) => {
      captured.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const state = buildSignInOAuthState({
      isDesktopClient: false,
      posthogDistinctId: "anon-xyz",
      flow: "signup",
    });

    const ok = await providerOAuthSignupAnalytics.captureCallbackQuery({
      provider: "google",
      state,
      code: "auth-code",
      providerError: null,
    });

    globalThis.fetch = originalFetch;

    expect(ok).toBe(true);
    expect(captured).toHaveLength(1);
    const body = captured[0] as {
      event: string;
      distinct_id: string;
      properties: Record<string, unknown>;
    };
    expect(body.event).toBe(OAUTH_CALLBACK_EVENT);
    expect(body.distinct_id).toBe("anon-xyz");
    expect(body.properties).toEqual({
      environment: "staging",
      provider: "google",
      flow: "signup",
      outcome: "success",
      $lib: "compass-backend",
    });
  });

  it("captures Apple form-post state with embedded anon distinct id and flow", async () => {
    const captured: unknown[] = [];
    using _env = mockEnv({
      POSTHOG_KEY: "phc_test",
      POSTHOG_HOST: "https://ph.example.test",
      NODE_ENV: "production",
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_input, init) => {
      captured.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const state = encodeAppleOAuthState(
      `${CONFIG.FRONTEND_URL}/auth/apple/callback`,
      {
        posthogDistinctId: "anon-apple",
        flow: "signup",
      },
    );

    await providerOAuthSignupAnalytics.captureCallbackQuery({
      provider: "apple",
      state,
      code: "auth-code",
      providerError: null,
    });

    globalThis.fetch = originalFetch;

    const body = captured[0] as {
      distinct_id: string;
      properties: Record<string, unknown>;
    };
    expect(body.distinct_id).toBe("anon-apple");
    expect(body.properties.flow).toBe("signup");
  });

  it("captures access_denied failures on the same oauth_callback event", async () => {
    const captured: unknown[] = [];
    using _env = mockEnv({
      POSTHOG_KEY: "phc_test",
      POSTHOG_HOST: "https://ph.example.test",
      NODE_ENV: "production",
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_input, init) => {
      captured.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const state = buildSignInOAuthState({
      isDesktopClient: false,
      posthogDistinctId: "anon-deny",
      flow: "signup",
    });

    await providerOAuthSignupAnalytics.captureCallbackQuery({
      provider: "google",
      state,
      code: null,
      providerError: "access_denied",
    });

    globalThis.fetch = originalFetch;

    const body = captured[0] as { properties: Record<string, unknown> };
    expect(body.properties).toMatchObject({
      outcome: "failure",
      reason: "access_denied",
      flow: "signup",
      environment: "production",
    });
  });
});
