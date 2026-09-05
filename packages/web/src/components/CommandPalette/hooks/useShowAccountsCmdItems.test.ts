import { UsersIcon } from "@phosphor-icons/react";
import { renderHook } from "@testing-library/react";
import { act } from "react";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as realUsesession from "@web/auth/compass/session/useSession";
import {
  selectIsSettingsOpen,
  selectOverlayOpenedFromPalette,
  selectSettingsPage,
  useSettingsStore,
} from "@web/settings/settings.store";
import { beforeEach, describe, expect, it, mock } from "bun:test";

const mockUseSession = mock();

mockModuleForFile("@web/auth/compass/session/useSession", realUsesession, {
  useSession: mockUseSession,
});

const { useShowAccountsCmdItems } = await import("./useShowAccountsCmdItems");

describe("useShowAccountsCmdItems", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      isSettingsOpen: false,
      settingsPage: "accounts",
    });
    mockUseSession.mockReset();
    mockUseSession.mockReturnValue({
      authenticated: true,
      setAuthenticated: mock(),
    });
  });

  it("returns no items when logged out", () => {
    mockUseSession.mockReturnValue({
      authenticated: false,
      setAuthenticated: mock(),
    });

    const { result } = renderHook(() => useShowAccountsCmdItems());

    expect(result.current).toEqual([]);
  });

  it("opens Settings on Accounts from the command palette item", () => {
    const { result } = renderHook(() => useShowAccountsCmdItems());

    expect(result.current[0].label).toBe("Manage Accounts");
    expect(result.current[0].icon).toBe(UsersIcon);
    expect(result.current[0].keywords).toContain("connect microsoft");
    expect(result.current[0].keywords).toContain("outlook");
    expect(result.current[0].keywords).not.toContain("billing");

    act(() => {
      result.current[0].onClick?.();
    });

    expect(selectIsSettingsOpen(useSettingsStore.getState())).toBe(true);
    expect(selectSettingsPage(useSettingsStore.getState())).toBe("accounts");
    expect(selectOverlayOpenedFromPalette(useSettingsStore.getState())).toBe(
      true,
    );
  });
});
