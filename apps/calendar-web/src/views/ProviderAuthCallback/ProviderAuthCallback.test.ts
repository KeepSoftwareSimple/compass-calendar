import { createTestToastPort } from "@web/__tests__/helpers/web-test-seams";
import { AuthApi } from "@web/api/auth.api";
import { session } from "@web/auth/compass/session/Session";
import { PROVIDER_AUTH_SCOPES_REQUIRED } from "@web/auth/providers/authorization/provider-authorization.constants";
import {
  readProviderAuthorizationIntent,
  writeProviderAuthorizationIntent,
} from "@web/auth/providers/authorization/provider-authorization.storage";
import {
  resetMissingPermissionsStoreForTests,
  selectMissingPermissionsProvider,
  selectMissingPermissionsSurface,
  useMissingPermissionsStore,
} from "@web/auth/providers/missing-permissions.store";
import { registerToastPort } from "@web/common/utils/toast/toast.port";
import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

mock.module(
  "@web/auth/providers/authorization/relay-provider-oauth-callback-telemetry",
  () => ({
    relayProviderOAuthCallbackTelemetry: () => undefined,
  }),
);

const { completeProviderAuthCallback } = await import(
  "@web/views/ProviderAuthCallback/ProviderAuthCallback"
);
const oauthSignupFunnel = await import("@web/auth/posthog/oauth-signup-funnel");

const GOOGLE_SCOPES_REQUIRED = PROVIDER_AUTH_SCOPES_REQUIRED.google;

const mockLoginOrSignup = mock();
const realLoginOrSignup = AuthApi.loginOrSignup;
AuthApi.loginOrSignup = mockLoginOrSignup as typeof AuthApi.loginOrSignup;

afterAll(() => {
  AuthApi.loginOrSignup = realLoginOrSignup;
});

const { port, mocks } = createTestToastPort();

const callbackSearch = (
  state: string,
  scope = GOOGLE_SCOPES_REQUIRED.join(" "),
) =>
  `?state=${encodeURIComponent(
    state,
  )}&code=auth-code&scope=${encodeURIComponent(scope)}`;

const writeIntent = (state: string, returnPath = "/week") => {
  writeProviderAuthorizationIntent("google", state, {
    intent: "signIn",
    returnPath,
    createdAt: Date.now(),
  });
};

describe("completeProviderAuthCallback (google)", () => {
  const completeAuthentication = mock();
  const navigate = mock();

  beforeEach(() => {
    window.history.replaceState(null, "", "/week");
    mocks.error.mockClear();
    registerToastPort(port);
    sessionStorage.clear();
    mockLoginOrSignup.mockClear();
    completeAuthentication.mockClear();
    navigate.mockClear();
    mockLoginOrSignup.mockResolvedValue({
      user: { emails: ["user@example.com"] },
    });
    resetMissingPermissionsStoreForTests();
  });

  it("finishes a saved Google sign-in intent and returns to the saved path", async () => {
    writeIntent("sign-in-state", "/week");

    await completeProviderAuthCallback({
      provider: "google",
      completeAuthentication,
      navigate,
      search: callbackSearch("sign-in-state"),
    });

    expect(mockLoginOrSignup).toHaveBeenCalledWith(
      expect.objectContaining({
        redirectURIInfo: expect.objectContaining({
          redirectURIQueryParams: expect.objectContaining({
            code: "auth-code",
            state: "sign-in-state",
          }),
        }),
        thirdPartyId: "google",
      }),
    );
    expect(completeAuthentication).toHaveBeenCalledWith({
      email: "user@example.com",
    });
    expect(mocks.error).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/week", { replace: true });
    expect(
      readProviderAuthorizationIntent("google", "sign-in-state"),
    ).toBeNull();
  });

  it("opens the connect missing-permissions modal when scopes are short on login", async () => {
    writeIntent("missing-scopes-state", "/week");

    await completeProviderAuthCallback({
      provider: "google",
      completeAuthentication,
      navigate,
      search: callbackSearch(
        "missing-scopes-state",
        GOOGLE_SCOPES_REQUIRED[0]!,
      ),
    });

    expect(mockLoginOrSignup).not.toHaveBeenCalled();
    expect(completeAuthentication).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
    const missingState = useMissingPermissionsStore.getState();
    expect(selectMissingPermissionsProvider(missingState)).toBe("google");
    expect(selectMissingPermissionsSurface(missingState)).toBe("connect_modal");
    expect(navigate).toHaveBeenCalledWith("/week", { replace: true });
  });

  it("opens the Google signup scopes recovery screen when signup OAuth is short scopes", async () => {
    writeProviderAuthorizationIntent("google", "signup-missing-scopes", {
      intent: "signIn",
      returnPath: "/week",
      createdAt: Date.now(),
      signupFlow: true,
    });

    await completeProviderAuthCallback({
      provider: "google",
      completeAuthentication,
      navigate,
      search: callbackSearch(
        "signup-missing-scopes",
        GOOGLE_SCOPES_REQUIRED[0]!,
      ),
    });

    const missingState = useMissingPermissionsStore.getState();
    expect(selectMissingPermissionsSurface(missingState)).toBe(
      "google_signup_recovery",
    );
    expect(missingState.missingScopes).toEqual(
      GOOGLE_SCOPES_REQUIRED.filter(
        (scope) => scope !== GOOGLE_SCOPES_REQUIRED[0],
      ),
    );
  });

  it("rejects a Google callback without a saved intent", async () => {
    spyOn(session, "doesSessionExist").mockResolvedValue(false);

    await completeProviderAuthCallback({
      provider: "google",
      completeAuthentication,
      navigate,
      search: callbackSearch("unknown-state"),
    });

    expect(mockLoginOrSignup).not.toHaveBeenCalled();
    expect(completeAuthentication).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledWith(
      "We couldn't connect your Google account. Please try again.",
      expect.any(Object),
    );
    expect(navigate).toHaveBeenCalledWith("/week", { replace: true });
  });

  it("ignores a stripped callback revisit when the user is already signed in", async () => {
    window.history.replaceState(null, "", "/auth/google/callback");
    spyOn(session, "doesSessionExist").mockResolvedValue(true);
    const trackOAuthSignupFailed = spyOn(
      oauthSignupFunnel,
      "trackOAuthSignupFailed",
    ).mockImplementation(() => undefined);

    await completeProviderAuthCallback({
      provider: "google",
      completeAuthentication,
      navigate,
      search: "",
    });

    expect(mockLoginOrSignup).not.toHaveBeenCalled();
    expect(completeAuthentication).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
    expect(trackOAuthSignupFailed).not.toHaveBeenCalled();
    trackOAuthSignupFailed.mockRestore();
    expect(navigate).toHaveBeenCalledWith("/week", { replace: true });
  });

  it("ignores a replayed callback when the user is already signed in", async () => {
    spyOn(session, "doesSessionExist").mockResolvedValue(true);
    const trackOAuthSignupFailed = spyOn(
      oauthSignupFunnel,
      "trackOAuthSignupFailed",
    ).mockImplementation(() => undefined);

    await completeProviderAuthCallback({
      provider: "google",
      completeAuthentication,
      navigate,
      search: callbackSearch("consumed-state"),
    });

    expect(mockLoginOrSignup).not.toHaveBeenCalled();
    expect(completeAuthentication).not.toHaveBeenCalled();
    expect(mocks.error).not.toHaveBeenCalled();
    expect(trackOAuthSignupFailed).not.toHaveBeenCalled();
    trackOAuthSignupFailed.mockRestore();
    expect(navigate).toHaveBeenCalledWith("/week", { replace: true });
  });
});
