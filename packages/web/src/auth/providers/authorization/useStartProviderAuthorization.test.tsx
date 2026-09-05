import { act, renderHook } from "@testing-library/react";
import { GOOGLE_SCOPES } from "@core/providers/google.scopes";
import { readProviderAuthorizationIntent } from "./provider-authorization.storage";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const mockGoogleLogin = mock();
const mockTrack = mock();
const mockAssignAuthorizationRedirect = mock();
const mockGetMicrosoftSignInClientId = mock(() => "microsoft-client-id");

mock.module("@react-oauth/google", () => ({
  useGoogleLogin: () => mockGoogleLogin,
}));

mock.module("@web/auth/posthog/track", () => ({
  track: (...args: unknown[]) => mockTrack(...args),
}));

mock.module("./provider-authorization.redirect", () => ({
  assignAuthorizationRedirect: (...args: unknown[]) =>
    mockAssignAuthorizationRedirect(...args),
}));

mock.module("./provider-authorization.config", () => ({
  getMicrosoftSignInClientId: () => mockGetMicrosoftSignInClientId(),
}));

const { useStartProviderAuthorizationImpl } =
  require("./useStartProviderAuthorization.impl") as typeof import("./useStartProviderAuthorization.impl");

describe("useStartProviderAuthorizationImpl", () => {
  beforeEach(() => {
    sessionStorage.clear();
    mockGoogleLogin.mockClear();
    mockTrack.mockClear();
    mockAssignAuthorizationRedirect.mockClear();
    mockGetMicrosoftSignInClientId.mockClear();
    mockGetMicrosoftSignInClientId.mockReturnValue("microsoft-client-id");
  });

  it("starts Google authorization with core scopes and analytics", () => {
    const { result } = renderHook(() =>
      useStartProviderAuthorizationImpl("google", { intent: "signIn" }),
    );

    act(() => {
      result.current.startAuthorization();
    });

    expect(mockTrack).toHaveBeenCalledWith("oauth_redirect_started", {
      provider: "google",
      intent: "signIn",
    });
    expect(mockGoogleLogin).toHaveBeenCalled();
    const intents = Object.keys(sessionStorage).filter((key) =>
      key.includes("googleAuthorizationIntent"),
    );
    expect(intents).toHaveLength(1);
    const state = intents[0]?.split(".").at(-1);
    expect(state).toBeDefined();
    expect(readProviderAuthorizationIntent("google", state!)).toEqual(
      expect.objectContaining({
        intent: "signIn",
      }),
    );
    expect(GOOGLE_SCOPES.join(" ")).toContain(
      "https://www.googleapis.com/auth/userinfo.email",
    );
  });

  it("starts Microsoft authorization with analytics and a redirect", () => {
    const { result } = renderHook(() =>
      useStartProviderAuthorizationImpl("microsoft", { intent: "signIn" }),
    );

    act(() => {
      result.current.startAuthorization();
    });

    expect(mockTrack).toHaveBeenCalledWith("oauth_redirect_started", {
      provider: "microsoft",
      intent: "signIn",
    });
    expect(mockAssignAuthorizationRedirect).toHaveBeenCalledTimes(1);
    expect(
      String(mockAssignAuthorizationRedirect.mock.calls[0]?.[0]),
    ).toContain("login.microsoftonline.com/common/oauth2/v2.0/authorize");

    const intents = Object.keys(sessionStorage).filter((key) =>
      key.includes("providerAuthorizationIntent.microsoft"),
    );
    expect(intents).toHaveLength(1);
    const state = intents[0]?.split(".").at(-1);
    expect(readProviderAuthorizationIntent("microsoft", state!)).toEqual(
      expect.objectContaining({
        intent: "signIn",
      }),
    );
  });
});
