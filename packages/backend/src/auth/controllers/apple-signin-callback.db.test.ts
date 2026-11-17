import { OAUTH_CALLBACK_EVENT } from "@core/analytics/oauth-signup.events";
import { BaseDriver } from "@backend/__tests__/drivers/base.driver";
import { mockEnv } from "@backend/__tests__/helpers/mock.setup";
import {
  APPLE_SIGNIN_FORM_POST_PATH,
  APPLE_SIGNIN_SPA_CALLBACK_PATH,
  encodeAppleOAuthState,
} from "@backend/auth/services/apple/apple.auth.callback";
import { CONFIG } from "@backend/common/constants/config.constants";
import { afterEach, describe, expect, it } from "bun:test";

describe("POST /api/auth/apple/callback", () => {
  const baseDriver = new BaseDriver();
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("redirects a valid form_post to the SPA callback", async () => {
    const state = encodeAppleOAuthState(
      `${CONFIG.FRONTEND_URL}${APPLE_SIGNIN_SPA_CALLBACK_PATH}`,
    );

    const response = await baseDriver
      .getServer()
      .post(APPLE_SIGNIN_FORM_POST_PATH)
      .set("Origin", "https://appleid.apple.com")
      .type("form")
      .send({ code: "auth-code", state });

    expect(response.status).toBe(302);
    expect(response.headers["location"]).toContain(
      APPLE_SIGNIN_SPA_CALLBACK_PATH,
    );
    expect(response.headers["location"]).toContain("code=auth-code");
    expect(response.headers["location"]).toContain(
      `state=${encodeURIComponent(state)}`,
    );
  });

  it("rejects a missing or mismatched state", async () => {
    const missing = await baseDriver
      .getServer()
      .post(APPLE_SIGNIN_FORM_POST_PATH)
      .set("Origin", "https://appleid.apple.com")
      .type("form")
      .send({ code: "auth-code" });
    expect(missing.status).toBe(400);

    const mismatched = await baseDriver
      .getServer()
      .post(APPLE_SIGNIN_FORM_POST_PATH)
      .set("Origin", "https://appleid.apple.com")
      .type("form")
      .send({ code: "auth-code", state: "garbage" });
    expect(mismatched.status).toBe(400);
  });

  it("records one oauth_callback on form_post with anon distinct id, and ignores an empty GET probe", async () => {
    const captured: unknown[] = [];
    using _env = mockEnv({
      POSTHOG_KEY: "phc_test",
      POSTHOG_HOST: "https://ph.example.test",
      NODE_ENV: "production",
    });
    globalThis.fetch = (async (_input, init) => {
      captured.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    const state = encodeAppleOAuthState(
      `${CONFIG.FRONTEND_URL}${APPLE_SIGNIN_SPA_CALLBACK_PATH}`,
      { posthogDistinctId: "anon-apple-callback", flow: "signup" },
    );

    const post = await baseDriver
      .getServer()
      .post(APPLE_SIGNIN_FORM_POST_PATH)
      .set("Origin", "https://appleid.apple.com")
      .type("form")
      .send({ code: "auth-code", state });
    expect(post.status).toBe(302);

    const crawlerProbe = await baseDriver
      .getServer()
      .get(APPLE_SIGNIN_FORM_POST_PATH);
    expect(crawlerProbe.status).toBe(302);
    expect(crawlerProbe.headers["location"]).toBe(`${CONFIG.FRONTEND_URL}/`);

    expect(captured).toHaveLength(1);
    const body = captured[0] as {
      event: string;
      distinct_id: string;
      properties: Record<string, unknown>;
    };
    expect(body.event).toBe(OAUTH_CALLBACK_EVENT);
    expect(body.distinct_id).toBe("anon-apple-callback");
    expect(body.properties).toMatchObject({
      provider: "apple",
      flow: "signup",
      outcome: "success",
    });
  });
});
