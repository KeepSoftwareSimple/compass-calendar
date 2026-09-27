import { MICROSOFT_SCOPES } from "@core/providers/microsoft.scopes";
import {
  buildMicrosoftAuthorizationUrl,
  buildProviderAuthCallbackUrl,
  buildProviderAuthCodePayload,
  getSafeProviderAuthReturnPath,
} from "./provider-authorization.util";
import { describe, expect, it } from "bun:test";

describe("buildProviderAuthCallbackUrl", () => {
  it("builds the callback URL from the current origin", () => {
    expect(
      buildProviderAuthCallbackUrl("google", "http://localhost:9080"),
    ).toBe("http://localhost:9080/auth/google/callback");
  });
});

describe("getSafeProviderAuthReturnPath", () => {
  it("keeps same-origin app paths as return paths", () => {
    expect(
      getSafeProviderAuthReturnPath(
        "google",
        "http://localhost:9080/day/2026-05-05?x=1#agenda",
        "http://localhost:9080",
      ),
    ).toBe("/day/2026-05-05?x=1#agenda");
  });

  it("strips transient auth-modal params but keeps other params", () => {
    expect(
      getSafeProviderAuthReturnPath(
        "google",
        "http://localhost:9080/week/2026-07-08?auth=login&token=abc&x=1",
        "http://localhost:9080",
      ),
    ).toBe("/week/2026-07-08?x=1");
  });

  it("falls back to /week for external return paths", () => {
    expect(
      getSafeProviderAuthReturnPath(
        "google",
        "https://evil.example/phish",
        "http://localhost:9080",
      ),
    ).toBe("/week");
  });
});

describe("buildProviderAuthCodePayload", () => {
  it("builds the existing auth-code payload shape", () => {
    expect(
      buildProviderAuthCodePayload({
        provider: "google",
        code: "auth-code",
        scope: "email profile",
        state: "state-1",
        redirectUri: "http://localhost:9080/auth/google/callback",
      }),
    ).toEqual({
      thirdPartyId: "google",
      clientType: "web",
      redirectURIInfo: {
        redirectURIOnProviderDashboard:
          "http://localhost:9080/auth/google/callback",
        redirectURIQueryParams: {
          code: "auth-code",
          scope: "email profile",
          state: "state-1",
        },
      },
    });
  });
});

describe("buildMicrosoftAuthorizationUrl", () => {
  it("builds the common Microsoft authorize URL", () => {
    const url = buildMicrosoftAuthorizationUrl({
      clientId: "microsoft-client-id",
      redirectUri: buildProviderAuthCallbackUrl(
        "microsoft",
        "http://localhost:9080",
      ),
      scopes: MICROSOFT_SCOPES,
      state: "microsoft-state",
      prompt: "consent",
    });

    expect(url).toContain(
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    );
    expect(url).toContain("client_id=microsoft-client-id");
    expect(url).toContain(
      encodeURIComponent("http://localhost:9080/auth/microsoft/callback"),
    );
    expect(url).toContain("scope=openid");
    expect(url).toContain("Calendars.ReadWrite");
    expect(url).toContain("state=microsoft-state");
    expect(url).toContain("prompt=consent");
  });
});
