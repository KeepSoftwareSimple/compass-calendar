import { MICROSOFT_SCOPES } from "@core/providers/microsoft.scopes";
import {
  buildMicrosoftAuthorizationUrl,
  buildProviderAuthCallbackUrl,
} from "./provider-authorization.util";
import { describe, expect, it } from "bun:test";

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
