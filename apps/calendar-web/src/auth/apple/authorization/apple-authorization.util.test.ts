import { ENV_WEB } from "@web/common/constants/env.constants";
import { APPLE_SIGNIN_FORM_POST_PATH } from "./apple-authorization.constants";
import {
  buildAppleAuthCodePayload,
  buildAppleSignInRedirectUri,
} from "./apple-authorization.util";
import { describe, expect, it } from "bun:test";

describe("buildAppleAuthCodePayload", () => {
  it("posts the code to SuperTokens with Apple's backend form_post redirect", () => {
    expect(buildAppleSignInRedirectUri()).toBe(
      `${ENV_WEB.BACKEND_BASEURL}${APPLE_SIGNIN_FORM_POST_PATH}`,
    );
    expect(
      buildAppleAuthCodePayload({
        code: "auth-code",
        state: "oauth-state",
        user: '{"name":{"firstName":"Ada"}}',
      }),
    ).toEqual({
      thirdPartyId: "apple",
      clientType: "web",
      redirectURIInfo: {
        redirectURIOnProviderDashboard: buildAppleSignInRedirectUri(),
        redirectURIQueryParams: {
          code: "auth-code",
          state: "oauth-state",
          user: '{"name":{"firstName":"Ada"}}',
        },
      },
    });
  });

  it("omits optional form fields when Apple did not send them", () => {
    expect(buildAppleAuthCodePayload({ code: "auth-code" })).toEqual({
      thirdPartyId: "apple",
      clientType: "web",
      redirectURIInfo: {
        redirectURIOnProviderDashboard: buildAppleSignInRedirectUri(),
        redirectURIQueryParams: { code: "auth-code" },
      },
    });
  });
});
