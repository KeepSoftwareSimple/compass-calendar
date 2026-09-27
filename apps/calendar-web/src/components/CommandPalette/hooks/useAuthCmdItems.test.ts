import { renderHook } from "@testing-library/react";
import { act } from "react";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as realUsesession from "@web/auth/compass/session/useSession";
import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const mockOpenModal = mock();
const mockUseAuthModal = mock();
const mockUseAuthFeatureFlag = mock();
const mockUseSession = mock();

mockModuleForFile("@web/auth/compass/session/useSession", realUsesession, {
  useSession: mockUseSession,
});

// mock.module is process-wide, not scoped to this file, and isn't reliably
// "restorable" afterward (another file's top-level dynamic import can race
// with this file's afterAll). So the factory spreads the real module's other
// exports (AuthModalContext, useAuthModalState, validateAuthSearch - none of
// which this file's own tests touch, but AuthModalProvider/router code
// elsewhere needs the real ones) and only conditionally overrides
// useAuthModal, checked on every call instead of frozen in at registration.
const actualAuthModal = {
  ...(await import("@web/components/AuthModal/hooks/useAuthModal")),
};
let isAuthModalMocked = true;

mock.module("@web/components/AuthModal/hooks/useAuthModal", () => ({
  ...actualAuthModal,
  useAuthModal: (...args: unknown[]) =>
    isAuthModalMocked
      ? mockUseAuthModal(...args)
      : // biome-ignore lint/correctness/useHookAtTopLevel: this is a mock.module factory, not a component - the flag is stable for the lifetime of any given render (it only flips once, in afterAll, after this file's components have unmounted).
        actualAuthModal.useAuthModal(),
}));

afterAll(() => {
  isAuthModalMocked = false;
});

const { useAuthCmdItems } =
  require("./useAuthCmdItems") as typeof import("./useAuthCmdItems");

describe("useAuthCmdItems", () => {
  beforeEach(() => {
    mockOpenModal.mockClear();
    mockUseAuthModal.mockClear();
    mockUseAuthFeatureFlag.mockClear();
    mockUseSession.mockClear();
    window.history.pushState({}, "", "/day");

    mockUseSession.mockReturnValue({
      authenticated: false,
      setAuthenticated: mock(),
    });
    mockUseAuthModal.mockReturnValue({
      isOpen: false,
      currentView: "login",
      openModal: mockOpenModal,
      closeModal: mock(),
      setView: mock(),
    });
    mockUseAuthFeatureFlag.mockReturnValue(false);
  });

  it("returns no items when authenticated", () => {
    window.history.pushState({}, "", "/day?auth=true");
    mockUseSession.mockReturnValue({
      authenticated: true,
      setAuthenticated: mock(),
    });

    const { result } = renderHook(() => useAuthCmdItems());

    expect(result.current).toEqual([]);
  });

  it("returns auth items when unauthenticated and auth feature flag is enabled", () => {
    window.history.pushState({}, "", "/day?auth=true");
    mockUseAuthFeatureFlag.mockReturnValue(true);

    const { result } = renderHook(() => useAuthCmdItems());

    expect(result.current.map((item) => item.id)).toEqual([
      "sign-up",
      "log-in",
    ]);
  });

  it("opens matching auth modal view when item actions are clicked", () => {
    window.history.pushState({}, "", "/day?auth=true");
    mockUseAuthFeatureFlag.mockReturnValue(true);

    const { result } = renderHook(() => useAuthCmdItems());
    const signUpItem = result.current.find((item) => item.id === "sign-up");
    const logInItem = result.current.find((item) => item.id === "log-in");

    act(() => {
      signUpItem?.onClick?.();
      logInItem?.onClick?.();
    });

    expect(mockOpenModal).toHaveBeenNthCalledWith(1, "signUp");
    expect(mockOpenModal).toHaveBeenNthCalledWith(2, "login");
  });
});
