import { BaseDriver } from "@backend/__tests__/drivers/base.driver";
import {
  APPLE_SIGNIN_FORM_POST_PATH,
  APPLE_SIGNIN_SPA_CALLBACK_PATH,
  encodeAppleOAuthState,
} from "@backend/auth/services/apple/apple.auth.callback";
import { CONFIG } from "@backend/common/constants/config.constants";
import { describe, expect, it } from "bun:test";

describe("POST /api/auth/apple/callback", () => {
  const baseDriver = new BaseDriver();

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
});
