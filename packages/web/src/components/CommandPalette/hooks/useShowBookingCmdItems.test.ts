import { CalendarIcon } from "@phosphor-icons/react/dist/csr/Calendar";
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

const { useShowBookingCmdItems } = await import("./useShowBookingCmdItems");

describe("useShowBookingCmdItems", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      isSettingsOpen: false,
      settingsPage: "accounts",
      overlayOpenedFromPalette: false,
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

    const { result } = renderHook(() => useShowBookingCmdItems());

    expect(result.current).toEqual([]);
  });

  it("returns no items when booking is disabled", () => {
    const { result } = renderHook(() => useShowBookingCmdItems(false));

    expect(result.current).toEqual([]);
  });

  it("opens Settings on Booking from the command palette item", () => {
    const { result } = renderHook(() => useShowBookingCmdItems());

    expect(result.current[0].label).toBe("Meeting settings");
    expect(result.current[0].icon).toBe(CalendarIcon);
    expect(result.current[0].keywords).toContain("availability");
    expect(result.current[0].keywords).toContain("meeting link");

    act(() => {
      result.current[0].onClick?.();
    });

    expect(selectIsSettingsOpen(useSettingsStore.getState())).toBe(true);
    expect(selectSettingsPage(useSettingsStore.getState())).toBe("booking");
    expect(selectOverlayOpenedFromPalette(useSettingsStore.getState())).toBe(
      true,
    );
  });
});
