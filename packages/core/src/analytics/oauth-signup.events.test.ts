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

  it("treats whitespace-only callback params as empty, not missing_code", () => {
    // A crawler GET of `?state=%20` must be ignored like a bare callback. The
    // backend service and the web landing recorder both gate on this rule, so
    // if it stopped trimming here the two would disagree about the same query.
    expect(
      isOAuthCallbackQueryEmpty({
        state: " ",
        code: null,
        providerError: null,
      }),
    ).toBe(true);
    expect(
      isOAuthCallbackQueryEmpty({
        state: "  ",
        code: "\t",
        providerError: "\n",
      }),
    ).toBe(true);
    expect(
      oauthFailedReasonFromCallbackQuery({
        state: " ",
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
