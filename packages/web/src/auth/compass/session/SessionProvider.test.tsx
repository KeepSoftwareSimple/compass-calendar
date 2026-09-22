import { renderHook, waitFor } from "@testing-library/react";
import { act, useContext } from "react";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import { session } from "@web/auth/compass/session/Session";
import * as realAuthStateUtil from "@web/auth/compass/state/auth.state.util";
import { DEFAULT_AUTH_STATE } from "@web/auth/compass/state/auth.state.util";
import * as userMetadataUtil from "@web/auth/compass/user/util/user-metadata.util";
import {
  initialUserMetadataState,
  userMetadataActions,
  useUserMetadataStore,
} from "@web/auth/state/user-metadata.store";
import * as sseProvider from "@web/sse/provider/SSEProvider";
import {
  afterAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

// spyOn (restorable) rather than mock.module: mock.module leaks process-wide
// and would replace refreshUserMetadata with a no-op for later files that
// exercise the real coalescing/fetch path.
const refreshUserMetadata = spyOn(
  userMetadataUtil,
  "refreshUserMetadata",
).mockResolvedValue(undefined);
// SSEProvider.test.tsx has its own dedicated test importing the real module —
// mock.module leaks process-wide across files, so spy on the real module's
// exports (restorable) instead of mock.module'ing the whole path.
const openStream = spyOn(sseProvider, "openStream").mockImplementation(
  (() => {}) as never,
);
const closeStream = spyOn(sseProvider, "closeStream").mockImplementation(
  () => {},
);
const getStream = spyOn(sseProvider, "getStream").mockImplementation(
  (() => null) as never,
);
const markUserAsAuthenticated = mock();
const getLastKnownEmail = mock().mockReturnValue("test@example.com");
const clearAnonymousCalendarChangeSignUpPrompt = mock();
const clearAuthenticationState = mock();
const getAuthState = mock(() => DEFAULT_AUTH_STATE);
const hasUserEverAuthenticated = mock();
const markAnonymousCalendarChangeForSignUpPrompt = mock();
const shouldShowAnonymousCalendarChangeSignUpPrompt = mock(() => false);
const subscribeToAuthState = mock();
const updateAuthState = mock();
const doesSessionExist = spyOn(session, "doesSessionExist");

mockModuleForFile(
  "@web/auth/compass/state/auth.state.util",
  realAuthStateUtil,
  {
    clearAnonymousCalendarChangeSignUpPrompt,
    clearAuthenticationState,
    getAuthState,
    getLastKnownEmail,
    hasUserEverAuthenticated,
    markUserAsAuthenticated,
    markAnonymousCalendarChangeForSignUpPrompt,
    shouldShowAnonymousCalendarChangeSignUpPrompt,
    subscribeToAuthState,
    updateAuthState,
  },
);

const { SessionContext } =
  require("./session.context") as typeof import("./session.context");
const { SessionProvider, sessionInit } =
  require("./SessionProvider") as typeof import("./SessionProvider");

describe("SessionProvider sessionInit", () => {
  afterAll(() => {
    refreshUserMetadata.mockRestore();
    openStream.mockRestore();
    closeStream.mockRestore();
    getStream.mockRestore();
  });

  beforeEach(() => {
    // Reset all mocks
    refreshUserMetadata.mockClear();
    openStream.mockClear();
    closeStream.mockClear();
    getStream.mockClear();
    markUserAsAuthenticated.mockClear();
    getLastKnownEmail.mockClear().mockReturnValue("test@example.com");
    clearAnonymousCalendarChangeSignUpPrompt.mockClear();
    clearAuthenticationState.mockClear();
    getAuthState.mockClear().mockReturnValue(DEFAULT_AUTH_STATE);
    hasUserEverAuthenticated.mockClear();
    markAnonymousCalendarChangeForSignUpPrompt.mockClear();
    shouldShowAnonymousCalendarChangeSignUpPrompt.mockClear();
    shouldShowAnonymousCalendarChangeSignUpPrompt.mockReturnValue(false);
    subscribeToAuthState.mockClear();
    updateAuthState.mockClear();
    doesSessionExist.mockClear();
  });

  it("refreshes user metadata when a session already exists", async () => {
    getStream.mockReturnValue(null);
    doesSessionExist.mockResolvedValue(true);

    sessionInit();

    await waitFor(() => {
      expect(markUserAsAuthenticated).toHaveBeenCalledWith("test@example.com");
      expect(refreshUserMetadata).toHaveBeenCalledTimes(1);
    });
    expect(openStream).toHaveBeenCalledTimes(1);
  });

  it("refreshes metadata on session creation and clears it on sign out", async () => {
    getStream.mockReturnValue({} as EventSource); // stream already open
    doesSessionExist.mockResolvedValue(false);

    sessionInit();

    // Simulate SESSION_CREATED event
    session.emit({ action: "SESSION_CREATED", userContext: undefined });

    await waitFor(() => {
      expect(markUserAsAuthenticated).toHaveBeenCalledWith("test@example.com");
      expect(refreshUserMetadata).toHaveBeenCalledTimes(1);
    });
    // closeStream + openStream both called for SESSION_CREATED
    expect(closeStream).toHaveBeenCalledTimes(1);
    expect(openStream).toHaveBeenCalledTimes(1);

    // Simulate SIGN_OUT event; user metadata should be cleared
    userMetadataActions.set({ connections: [] });
    session.emit({ action: "SIGN_OUT", userContext: undefined });

    expect(useUserMetadataStore.getState()).toEqual(initialUserMetadataState);
    expect(closeStream).toHaveBeenCalledTimes(2);
  });

  it("updates session consumers when SuperTokens creates a session", async () => {
    getStream.mockReturnValue({} as EventSource);
    doesSessionExist.mockResolvedValue(false);

    const { result } = renderHook(() => useContext(SessionContext), {
      wrapper: SessionProvider,
    });

    act(() => {
      result.current.setAuthenticated(false);
    });

    expect(result.current.authenticated).toBe(false);

    sessionInit();
    act(() => {
      session.emit({ action: "SESSION_CREATED", userContext: undefined });
    });

    expect(result.current.authenticated).toBe(true);
  });
});
