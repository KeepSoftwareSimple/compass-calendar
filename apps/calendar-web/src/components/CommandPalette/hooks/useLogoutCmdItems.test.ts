import { renderHook } from "@testing-library/react";
import { act } from "react";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as realUsesession from "@web/auth/compass/session/useSession";
import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const mockOpenLogoutConfirmation = mock();
const mockUseLogoutConfirmation = mock();
const mockUseSession = mock();

mockModuleForFile("@web/auth/compass/session/useSession", realUsesession, {
  useSession: mockUseSession,
});

// mock.module is process-wide, so the factory must keep the module's other
// exports (LogoutConfirmationContext, useLogoutConfirmationState - the
// provider's own tests need the real ones) and only override the hook while
// this file runs, checked on every call instead of frozen in at registration.
const actualUseLogoutConfirmation = {
  ...(await import(
    "@web/components/LogoutConfirmation/hooks/useLogoutConfirmation"
  )),
};
let isLogoutConfirmationMocked = true;

mock.module(
  "@web/components/LogoutConfirmation/hooks/useLogoutConfirmation",
  () => ({
    ...actualUseLogoutConfirmation,
    useLogoutConfirmation: (...args: unknown[]) =>
      isLogoutConfirmationMocked
        ? mockUseLogoutConfirmation(...args)
        : // biome-ignore lint/correctness/useHookAtTopLevel: this is a mock.module factory, not a component - the flag only flips once, in afterAll, after this file's components have unmounted.
          actualUseLogoutConfirmation.useLogoutConfirmation(),
  }),
);

afterAll(() => {
  isLogoutConfirmationMocked = false;
});

const { useLogoutCmdItems } = await import("./useLogoutCmdItems");

describe("useLogoutCmdItems", () => {
  beforeEach(() => {
    mockOpenLogoutConfirmation.mockClear();
    mockUseLogoutConfirmation.mockReset();
    mockUseSession.mockReset();
    mockUseSession.mockReturnValue({
      authenticated: true,
      setAuthenticated: mock(),
    });
    mockUseLogoutConfirmation.mockReturnValue({
      openLogoutConfirmation: mockOpenLogoutConfirmation,
    });
  });

  it("returns no items when logged out", () => {
    mockUseSession.mockReturnValue({
      authenticated: false,
      setAuthenticated: mock(),
    });

    const { result } = renderHook(() => useLogoutCmdItems());

    expect(result.current).toEqual([]);
  });

  it("opens logout confirmation from the command palette item", () => {
    const { result } = renderHook(() => useLogoutCmdItems());
    const logoutItem = result.current[0];

    act(() => {
      logoutItem.onClick?.();
    });

    expect(mockOpenLogoutConfirmation).toHaveBeenCalledTimes(1);
  });
});
