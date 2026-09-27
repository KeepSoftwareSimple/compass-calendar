import { renderHook } from "@testing-library/react";
import { act } from "react";
import { mockModuleForFile } from "@web/__tests__/utils/mock-module.test.util";
import * as realUsesession from "@web/auth/compass/session/useSession";
import {
  initialCardUpdateState,
  useCardUpdateStore,
} from "@web/billing/card-update.store";
import * as realUseappaccess from "@web/billing/useAppAccess";
import { type AppAccess } from "@web/billing/useAppAccess";
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

let access: AppAccess = { kind: "open" };
mockModuleForFile("@web/billing/useAppAccess", realUseappaccess, {
  useAppAccess: () => access,
});

const { useShowBillingCmdItems } = await import("./useShowBillingCmdItems");

describe("useShowBillingCmdItems", () => {
  beforeEach(() => {
    useSettingsStore.setState({
      isSettingsOpen: false,
      settingsPage: "accounts",
    });
    access = { kind: "open" };
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

    const { result } = renderHook(() => useShowBillingCmdItems());

    expect(result.current).toEqual([]);
  });

  it("returns no items on an install without billing", () => {
    const { result } = renderHook(() => useShowBillingCmdItems());

    expect(result.current).toEqual([]);
  });

  it("opens Settings on Billing and shows the plan badge", () => {
    access = {
      kind: "server",
      status: "active",
      isReadOnly: false,
      trialEndsAt: null,
    };

    const { result } = renderHook(() => useShowBillingCmdItems());

    expect(result.current[0].label).toBe("Manage Billing");
    expect(result.current[0].badge).toBe("Premium");

    act(() => {
      result.current[0].onClick?.();
    });

    expect(selectIsSettingsOpen(useSettingsStore.getState())).toBe(true);
    expect(selectSettingsPage(useSettingsStore.getState())).toBe("billing");
    expect(selectOverlayOpenedFromPalette(useSettingsStore.getState())).toBe(
      true,
    );
  });

  it("opens Settings on Billing with the card form from Update card", () => {
    access = {
      kind: "server",
      status: "active",
      isReadOnly: false,
      trialEndsAt: null,
    };
    useCardUpdateStore.setState(initialCardUpdateState, true);

    const { result } = renderHook(() => useShowBillingCmdItems());
    const updateCard = result.current.find((item) => item.id === "update-card");
    expect(updateCard?.label).toBe("Update card");

    act(() => {
      updateCard?.onClick?.();
    });

    expect(selectSettingsPage(useSettingsStore.getState())).toBe("billing");
    expect(useCardUpdateStore.getState().isOpen).toBe(true);
  });
});
