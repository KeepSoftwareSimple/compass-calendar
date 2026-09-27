import { HotkeyManager, HotkeysProvider } from "@tanstack/react-hotkeys";
import { act, renderHook, waitFor } from "@testing-library/react";
import { type PropsWithChildren } from "react";
import { pressKey } from "@web/__tests__/utils/keyboard.test.util";
import {
  selectIsShortcutsOpen,
  selectIsSidebarOpen,
  useViewStore,
  viewActions,
} from "@web/events/stores/view.store";
import { clearAppLockReasons, setAppLockReason } from "@web/shortcuts/app-lock";
import { useSidebarShortcuts } from "./useSidebarShortcuts";
import { beforeEach, describe, expect, it } from "bun:test";

function wrapper({ children }: PropsWithChildren) {
  return <HotkeysProvider>{children}</HotkeysProvider>;
}

const isShortcutsOpen = () => selectIsShortcutsOpen(useViewStore.getState());

describe("useSidebarShortcuts", () => {
  beforeEach(() => {
    HotkeyManager.resetInstance();
    viewActions.setSidebarOpen(false);
    clearAppLockReasons();
  });

  it("opens the sidebar before opening shortcuts with ?", async () => {
    renderHook(() => useSidebarShortcuts(), { wrapper });

    act(() => {
      pressKey("?", {
        keyDownInit: { shiftKey: true },
        keyUpInit: { shiftKey: true },
      });
    });

    await waitFor(() => {
      expect(selectIsSidebarOpen(useViewStore.getState())).toBe(true);
      expect(isShortcutsOpen()).toBe(true);
    });
  });

  it("toggles shortcuts closed with ? when they are already open", async () => {
    viewActions.setSidebarOpen(true);
    renderHook(() => useSidebarShortcuts(), { wrapper });

    act(() => {
      pressKey("?", {
        keyDownInit: { shiftKey: true },
        keyUpInit: { shiftKey: true },
      });
    });

    await waitFor(() => {
      expect(isShortcutsOpen()).toBe(true);
    });

    act(() => {
      pressKey("?", {
        keyDownInit: { shiftKey: true },
        keyUpInit: { shiftKey: true },
      });
    });

    await waitFor(() => {
      expect(isShortcutsOpen()).toBe(false);
    });
  });

  it("opens shortcuts from the shifted slash key event", async () => {
    viewActions.setSidebarOpen(true);
    renderHook(() => useSidebarShortcuts(), { wrapper });

    act(() => {
      pressKey("/", {
        keyDownInit: { shiftKey: true },
        keyUpInit: { shiftKey: true },
      });
    });

    await waitFor(() => {
      expect(isShortcutsOpen()).toBe(true);
    });
  });

  it("closes shortcuts when the sidebar closes", async () => {
    viewActions.setSidebarOpen(true);
    renderHook(() => useSidebarShortcuts(), { wrapper });

    act(() => {
      viewActions.toggleShortcuts();
    });

    await waitFor(() => {
      expect(isShortcutsOpen()).toBe(true);
    });

    act(() => {
      viewActions.setSidebarOpen(false);
    });

    await waitFor(() => {
      expect(isShortcutsOpen()).toBe(false);
    });
  });

  it("does not toggle shortcuts with ]", async () => {
    viewActions.setSidebarOpen(true);
    renderHook(() => useSidebarShortcuts(), { wrapper });

    act(() => {
      pressKey("]");
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(isShortcutsOpen()).toBe(false);
  });

  it("does not open shortcuts while another overlay holds the app lock", async () => {
    setAppLockReason("shortcutShowcase", true);
    viewActions.setSidebarOpen(true);
    renderHook(() => useSidebarShortcuts(), { wrapper });

    act(() => {
      pressKey("?", {
        keyDownInit: { shiftKey: true },
        keyUpInit: { shiftKey: true },
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(isShortcutsOpen()).toBe(false);
  });

  it("still closes an already-open overlay while the app is locked", async () => {
    viewActions.setSidebarOpen(true);
    renderHook(() => useSidebarShortcuts(), { wrapper });

    act(() => {
      viewActions.toggleShortcuts();
    });
    await waitFor(() => {
      expect(isShortcutsOpen()).toBe(true);
    });

    setAppLockReason("shortcutShowcase", true);

    act(() => {
      pressKey("?", {
        keyDownInit: { shiftKey: true },
        keyUpInit: { shiftKey: true },
      });
    });

    await waitFor(() => {
      expect(isShortcutsOpen()).toBe(false);
    });
  });
});
