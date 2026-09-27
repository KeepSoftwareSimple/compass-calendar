import {
  HotkeyManager,
  HotkeysProvider,
  resolveModifier,
} from "@tanstack/react-hotkeys";
import { act, renderHook, waitFor } from "@testing-library/react";
import { type PropsWithChildren } from "react";
import { pressKey } from "@web/__tests__/utils/keyboard.test.util";
import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import {
  clearOverlayEscapeStack,
  useOverlayEscape,
} from "@web/components/OverlayPanel/overlay-escape";
import { welcomeGuideActions } from "@web/components/WelcomeModal/welcome.guide.store";
import {
  selectIsSidebarOpen,
  useViewStore,
} from "@web/events/stores/view.store";
import {
  initialSettingsState,
  selectIsCmdPaletteOpen,
  useSettingsStore,
} from "@web/settings/settings.store";
import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const mockNavigate = mock();
const mockPathname = { value: "/week" };

// mock.module is process-wide, not scoped to this file, and isn't reliably
// "restorable" afterward (another file's top-level dynamic import can race
// with this file's afterAll). So useNavigate/useLocation below are wrapped
// to check a flag on every call instead of freezing the mock in at
// registration time - once the flag flips off (afterAll), callers anywhere
// in the process fall through to the real implementation. The module is
// snapshotted into a plain object (not just held as a namespace reference)
// because mock.module mutates the live module object in place.
const actualTanstackRouter = { ...(await import("@tanstack/react-router")) };
let isRouterMocked = true;

mock.module("@tanstack/react-router", () => ({
  ...actualTanstackRouter,
  useNavigate: (...args: unknown[]) =>
    isRouterMocked
      ? mockNavigate
      : // biome-ignore lint/correctness/useHookAtTopLevel: this is a mock.module factory, not a component - the flag is stable for the lifetime of any given render (it only flips once, in afterAll, after this file's components have unmounted).
        actualTanstackRouter.useNavigate(...(args as [])),
  useLocation: (...args: unknown[]) =>
    isRouterMocked
      ? { pathname: mockPathname.value }
      : // biome-ignore lint/correctness/useHookAtTopLevel: this is a mock.module factory, not a component - the flag is stable for the lifetime of any given render (it only flips once, in afterAll, after this file's components have unmounted).
        actualTanstackRouter.useLocation(...(args as [])),
}));

const { useGlobalShortcuts, useNavigationShortcuts } = await import(
  "./useGlobalShortcuts"
);

afterAll(() => {
  isRouterMocked = false;
});

function wrapper({ children }: PropsWithChildren) {
  return <HotkeysProvider>{children}</HotkeysProvider>;
}

const pressModK = () => {
  const isMac = resolveModifier("Mod") === "Meta";
  pressKey("k", {
    keyDownInit: isMac ? { metaKey: true } : { ctrlKey: true },
  });
};

describe("useGlobalShortcuts", () => {
  beforeEach(() => {
    HotkeyManager.resetInstance();
    mockNavigate.mockClear();
    mockPathname.value = "/week";
    useSettingsStore.setState(initialSettingsState, true);
    welcomeGuideActions.setFirstVisitOpen(false);
    welcomeGuideActions.close();
  });

  it("does not navigate to Day view when a held-Cmd D keyup is replayed after a Mod+D press", async () => {
    const { unmount } = renderHook(() => useGlobalShortcuts(), { wrapper });

    // Mod+D pressed (e.g. Event Form duplicate shortcut). The test platform
    // resolves "Mod" to Control, so use ctrlKey here to match. Dispatched
    // directly (rather than via the paired `pressKey` helper) so the
    // modifier-swallowed keyup below isn't preceded by an extra, unwanted
    // unmodified keyup.
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          cancelable: true,
          key: "d",
          ctrlKey: true,
        }),
      );
    });

    // macOS swallows the "d" keyup while the modifier is held, then replays
    // it once the modifier is released — by then the modifier flag is
    // already false, matching the bare "D" Day-view shortcut unless
    // explicitly suppressed.
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keyup", {
          bubbles: true,
          cancelable: true,
          key: "d",
          ctrlKey: false,
        }),
      );
    });

    expect(mockNavigate).not.toHaveBeenCalled();

    act(() => {
      unmount();
    });
  });

  it("toggles and persists the sidebar when pressing ]", async () => {
    const { unmount } = renderHook(() => useGlobalShortcuts(), { wrapper });

    expect(selectIsSidebarOpen(useViewStore.getState())).toBe(true);

    act(() => {
      pressKey("]");
    });

    await waitFor(() => {
      expect(selectIsSidebarOpen(useViewStore.getState())).toBe(false);
    });
    expect(localStorage.getItem(STORAGE_KEYS.SIDEBAR_OPEN)).toBe("false");

    act(() => {
      pressKey("]");
    });

    await waitFor(() => {
      expect(selectIsSidebarOpen(useViewStore.getState())).toBe(true);
    });
    expect(localStorage.getItem(STORAGE_KEYS.SIDEBAR_OPEN)).toBe("true");

    act(() => {
      unmount();
    });
  });

  it("does not toggle the sidebar when pressing [", async () => {
    const { unmount } = renderHook(() => useGlobalShortcuts(), { wrapper });

    expect(selectIsSidebarOpen(useViewStore.getState())).toBe(true);

    act(() => {
      pressKey("[");
    });

    expect(selectIsSidebarOpen(useViewStore.getState())).toBe(true);

    act(() => {
      unmount();
    });
  });

  it("keeps the root navigation shortcut set independent from sidebar toggles", () => {
    const { unmount } = renderHook(() => useNavigationShortcuts(), { wrapper });

    expect(selectIsSidebarOpen(useViewStore.getState())).toBe(true);

    act(() => {
      pressKey("]");
    });

    expect(selectIsSidebarOpen(useViewStore.getState())).toBe(true);

    act(() => {
      unmount();
    });
  });

  it("still navigates to Day view for a plain D press", async () => {
    const { unmount } = renderHook(() => useGlobalShortcuts(), { wrapper });

    act(() => {
      pressKey("d");
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/day" });
    });

    act(() => {
      unmount();
    });
  });

  it("navigates to Life view for a plain L press", async () => {
    const { unmount } = renderHook(() => useGlobalShortcuts(), { wrapper });

    act(() => {
      pressKey("l");
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: "/life" });
    });

    act(() => {
      unmount();
    });
  });

  it("does not navigate when pressing W while already on a dated week route", () => {
    mockPathname.value = "/week/2026-05-20";
    const { unmount } = renderHook(() => useGlobalShortcuts(), { wrapper });

    act(() => {
      pressKey("w");
    });

    expect(mockNavigate).not.toHaveBeenCalled();

    act(() => {
      unmount();
    });
  });

  it("does not open the command palette while first-visit welcome is open", () => {
    welcomeGuideActions.setFirstVisitOpen(true);
    const { unmount } = renderHook(() => useGlobalShortcuts(), { wrapper });
    const keepFocus = document.createElement("button");
    keepFocus.textContent = "Keep focus";
    document.body.appendChild(keepFocus);
    keepFocus.focus();

    act(() => {
      pressModK();
    });

    expect(selectIsCmdPaletteOpen(useSettingsStore.getState())).toBe(false);
    expect(document.activeElement).toBe(keepFocus);

    keepFocus.remove();
    act(() => {
      unmount();
    });
  });

  it("toggles the command palette after first-visit welcome is dismissed", () => {
    const { unmount } = renderHook(() => useGlobalShortcuts(), { wrapper });

    act(() => {
      pressModK();
    });

    expect(selectIsCmdPaletteOpen(useSettingsStore.getState())).toBe(true);

    act(() => {
      unmount();
    });
  });

  it("closes the command palette on Escape", () => {
    useSettingsStore.setState({ isCmdPaletteOpen: true });
    const { unmount } = renderHook(() => useGlobalShortcuts(), { wrapper });

    act(() => {
      pressKey("Escape");
    });

    expect(selectIsCmdPaletteOpen(useSettingsStore.getState())).toBe(false);

    act(() => {
      unmount();
    });
  });

  it("does not close the command palette on Escape while an overlay owns it", () => {
    useSettingsStore.setState({ isCmdPaletteOpen: true });
    const keepFocus = document.createElement("button");
    keepFocus.textContent = "Keep overlay focus";
    document.body.appendChild(keepFocus);
    keepFocus.focus();
    const { unmount } = renderHook(
      () => {
        useGlobalShortcuts();
        useOverlayEscape({ onDismiss: () => {} });
      },
      { wrapper },
    );

    act(() => {
      pressKey("Escape");
    });

    expect(selectIsCmdPaletteOpen(useSettingsStore.getState())).toBe(true);
    expect(document.activeElement).toBe(keepFocus);

    keepFocus.remove();
    act(() => {
      unmount();
    });
    clearOverlayEscapeStack();
  });

  it("does not blur the focused control on Escape when the palette is closed", () => {
    const keepFocus = document.createElement("button");
    keepFocus.textContent = "Keep focus";
    document.body.appendChild(keepFocus);
    keepFocus.focus();
    const { unmount } = renderHook(() => useGlobalShortcuts(), { wrapper });

    act(() => {
      pressKey("Escape");
    });

    expect(document.activeElement).toBe(keepFocus);

    keepFocus.remove();
    act(() => {
      unmount();
    });
  });
});
