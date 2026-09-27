import { renderHook } from "@testing-library/react";
import { act } from "react";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import { session } from "@web/auth/compass/session/Session";
import * as realUsesession from "@web/auth/compass/session/useSession";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

const clearAuthenticationState = mock();
const setAuthenticated = mock();
const mockUseSession = mock();
const clearAccountScopedClientState = mock();
const posthogReset = mock();
let signOut = spyOn(session, "signOut");

// bun's mock.module is global and leaks into every other test file in the
// run. Spread the real module so unrelated suites still see its full surface,
// and only override what this file asserts on while it runs - the flag flips
// back to the real implementations in afterAll (logout.teardown's own tests
// run later in the suite and need the real functions).
const actualAuthStateUtil = {
  ...(await import("@web/auth/compass/state/auth.state.util")),
};
const actualLogoutTeardown = {
  ...(await import("@web/auth/compass/session/logout.teardown")),
};
const actualPosthogBootstrap = {
  ...(await import("@web/auth/posthog/posthog.bootstrap")),
};
let isLogoutMocked = true;

mockModuleForFile("@web/auth/compass/session/useSession", realUsesession, {
  useSession: mockUseSession,
});

mock.module("@web/auth/compass/state/auth.state.util", () => ({
  ...actualAuthStateUtil,
  clearAuthenticationState: (...args: unknown[]) =>
    isLogoutMocked
      ? clearAuthenticationState(...args)
      : actualAuthStateUtil.clearAuthenticationState(),
}));

mock.module("@web/auth/compass/session/logout.teardown", () => ({
  ...actualLogoutTeardown,
  clearAccountScopedClientState: (...args: unknown[]) =>
    isLogoutMocked
      ? clearAccountScopedClientState(...args)
      : actualLogoutTeardown.clearAccountScopedClientState(),
}));

mock.module("@web/auth/posthog/posthog.bootstrap", () => ({
  ...actualPosthogBootstrap,
  getPosthogClient: () =>
    isLogoutMocked
      ? { reset: posthogReset }
      : actualPosthogBootstrap.getPosthogClient(),
}));

afterAll(() => {
  isLogoutMocked = false;
});

const { useLogout } = await import("./useLogout");

describe("useLogout", () => {
  beforeEach(() => {
    signOut = spyOn(session, "signOut").mockResolvedValue(undefined);
    clearAuthenticationState.mockClear();
    clearAccountScopedClientState.mockClear();
    posthogReset.mockClear();
    setAuthenticated.mockClear();
    mockUseSession.mockReset();
    mockUseSession.mockReturnValue({
      authenticated: true,
      setAuthenticated,
    });
  });

  afterEach(() => {
    signOut.mockRestore();
  });

  it("resolves with signedOutRemotely=true on success", async () => {
    const { result } = renderHook(() => useLogout());

    const logoutPromise = act(async () => {
      return await result.current();
    });

    const response = await logoutPromise;
    expect(response).toEqual({ signedOutRemotely: true });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(clearAuthenticationState).toHaveBeenCalledTimes(1);
    expect(clearAccountScopedClientState).toHaveBeenCalledTimes(1);
    expect(posthogReset).toHaveBeenCalledTimes(1);
    expect(setAuthenticated).toHaveBeenCalledWith(false);
  });

  it("clears authentication state before awaiting signOut", async () => {
    const callOrder: string[] = [];
    clearAuthenticationState.mockImplementation(() => {
      callOrder.push("clearAuthenticationState");
    });
    signOut.mockImplementation(async () => {
      callOrder.push("signOut");
    });

    const { result } = renderHook(() => useLogout());
    await act(async () => {
      await result.current();
    });

    expect(callOrder[0]).toBe("clearAuthenticationState");
    expect(callOrder[1]).toBe("signOut");
  });

  it("does not set authenticated=false until after signOut completes", async () => {
    const callOrder: string[] = [];
    signOut.mockImplementation(async () => {
      callOrder.push("signOut");
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    setAuthenticated.mockImplementation(() => {
      callOrder.push("setAuthenticated");
    });

    const { result } = renderHook(() => useLogout());
    await act(async () => {
      await result.current();
    });

    expect(callOrder.indexOf("signOut")).toBeLessThan(
      callOrder.indexOf("setAuthenticated"),
    );
  });

  it("resolves with signedOutRemotely=false on rejection", async () => {
    const consoleWarn = spyOn(console, "warn").mockImplementation(() => {});
    const error = new Error("network");
    signOut.mockRejectedValue(error);

    const { result } = renderHook(() => useLogout());
    const response = await act(async () => {
      return await result.current();
    });

    expect(response).toEqual({ signedOutRemotely: false });
    expect(clearAuthenticationState).toHaveBeenCalledTimes(1);
    expect(clearAccountScopedClientState).toHaveBeenCalledTimes(1);
    expect(setAuthenticated).toHaveBeenCalledWith(false);
    expect(consoleWarn).toHaveBeenCalledWith(
      "Failed to complete backend sign-out:",
      error,
    );

    consoleWarn.mockRestore();
  });

  it("resolves with signedOutRemotely=false on timeout", async () => {
    const consoleWarn = spyOn(console, "warn").mockImplementation(() => {});
    signOut.mockReturnValue(new Promise(() => undefined)); // Never resolves

    const { result } = renderHook(() => useLogout());
    const response = await act(async () => {
      return await result.current();
    });

    expect(response).toEqual({ signedOutRemotely: false });
    expect(clearAccountScopedClientState).toHaveBeenCalledTimes(1);
    expect(setAuthenticated).toHaveBeenCalledWith(false);
    expect(consoleWarn).toHaveBeenCalled();

    consoleWarn.mockRestore();
  });
});
