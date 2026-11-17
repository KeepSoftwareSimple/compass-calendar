import {
  isOAuthCallbackQueryEmpty,
  oauthFailedReasonFromCallbackQuery,
} from "@core/analytics/oauth-signup.events";
import { describe, expect, it } from "bun:test";

describe("oauth-signup.events", () => {
  it("treats a blank callback query as empty rather than invalid_state", () => {
    expect(
      isOAuthCallbackQueryEmpty({
        state: null,
        code: null,
        providerError: null,
      }),
    ).toBe(true);
    expect(
      oauthFailedReasonFromCallbackQuery({
        state: null,
        code: null,
        providerError: null,
      }),
    ).toBeUndefined();
  });

  it("derives callback failure reasons from query params", () => {
    expect(
      oauthFailedReasonFromCallbackQuery({
        state: "x",
        code: null,
        providerError: null,
      }),
    ).toBe("missing_code");
    expect(
      oauthFailedReasonFromCallbackQuery({
        state: null,
        code: "abc",
        providerError: null,
      }),
    ).toBe("invalid_state");
    expect(
      oauthFailedReasonFromCallbackQuery({
        state: "x",
        code: "abc",
        providerError: "access_denied",
      }),
    ).toBe("access_denied");
    expect(
      oauthFailedReasonFromCallbackQuery({
        state: "x",
        code: "abc",
        providerError: "server_error",
      }),
    ).toBe("other");
  });
});
