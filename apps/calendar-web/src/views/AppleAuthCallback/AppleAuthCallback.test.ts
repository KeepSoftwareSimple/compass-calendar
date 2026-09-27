import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { AuthApi } from "@web/api/auth.api";
import {
  readAppleAuthorizationIntent,
  writeAppleAuthorizationIntent,
} from "@web/auth/apple/authorization/apple-authorization.storage";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const mockLoginOrSignup = mock();
const realLoginOrSignup = AuthApi.loginOrSignup;
AuthApi.loginOrSignup = mockLoginOrSignup as typeof AuthApi.loginOrSignup;

afterAll(() => {
  AuthApi.loginOrSignup = realLoginOrSignup;
});

const { port, mocks } = createTestToastPort();

const { completeAppleAuthCallback } =
  require("./AppleAuthCallback") as typeof import("./AppleAuthCallback");

const callbackSearch = (state: string) =>
  `?state=${encodeURIComponent(state)}&code=auth-code`;

const writeIntent = (state: string, returnPath = "/week") => {
  writeAppleAuthorizationIntent(state, {
    intent: "signIn",
    returnPath,
    createdAt: Date.now(),
  });
};

describe("completeAppleAuthCallback", () => {
  const completeAuthentication = mock();
  const navigate = mock();

  beforeEach(() => {
    mocks.error.mockClear();
    registerToastPort(port);
    sessionStorage.clear();
    mockLoginOrSignup.mockClear();
    completeAuthentication.mockClear();
    navigate.mockClear();
    mockLoginOrSignup.mockResolvedValue({
      createdNewRecipeUser: true,
      user: { emails: ["hidden@privaterelay.appleid.com"] },
    });
  });

  it("finishes a saved Apple sign-in intent without requiring calendar scopes", async () => {
    writeIntent("sign-in-state", "/week");

    await completeAppleAuthCallback({
      completeAuthentication,
      navigate,
      search: callbackSearch("sign-in-state"),
    });

    expect(mockLoginOrSignup).toHaveBeenCalledWith(
      expect.objectContaining({
        thirdPartyId: "apple",
        redirectURIInfo: expect.objectContaining({
          redirectURIOnProviderDashboard: expect.stringMatching(
            /\/api\/auth\/apple\/callback$/,
          ),
          redirectURIQueryParams: expect.objectContaining({
            code: "auth-code",
            state: "sign-in-state",
          }),
        }),
      }),
    );
    expect(completeAuthentication).toHaveBeenCalledWith({
      email: "hidden@privaterelay.appleid.com",
    });
    expect(mocks.error).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/week", { replace: true });
    expect(readAppleAuthorizationIntent("sign-in-state")).toBeNull();
  });

  it("rejects an Apple callback without a saved intent", async () => {
    await completeAppleAuthCallback({
      completeAuthentication,
      navigate,
      search: callbackSearch("unknown-state"),
    });

    expect(mockLoginOrSignup).not.toHaveBeenCalled();
    expect(completeAuthentication).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith(
      "We couldn't sign you in with Apple. Please try again.",
      expect.any(Object),
    );
    expect(navigate).toHaveBeenCalledWith("/week", { replace: true });
  });
});
