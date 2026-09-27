import { HotkeyManager, HotkeysProvider } from "@tanstack/react-hotkeys";
import { renderHook, waitFor } from "@testing-library/react";
import { type PropsWithChildren } from "react";
import { pressKey } from "@web/__tests__/utils/keyboard.test.util";
import { ID_SIDEBAR } from "@web/common/constants/web.constants";
import {
  selectIsSidebarOpen,
  useViewStore,
  viewActions,
} from "@web/events/stores/view.store";
import { useFocusSidebarShortcut } from "./useFocusSidebarShortcut";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

function wrapper({ children }: PropsWithChildren) {
  return <HotkeysProvider>{children}</HotkeysProvider>;
}

const addSidebarItem = () => {
  const sidebar = document.createElement("aside");
  sidebar.id = ID_SIDEBAR;
  const item = document.createElement("button");
  item.setAttribute("aria-label", "Sidebar item");
  sidebar.appendChild(item);
  document.body.appendChild(sidebar);
  return item;
};

describe("useFocusSidebarShortcut", () => {
  beforeEach(() => {
    HotkeyManager.resetInstance();
    viewActions.setSidebarOpen(false);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("opens the sidebar and focuses its first item with I when closed", async () => {
    const item = addSidebarItem();

    renderHook(() => useFocusSidebarShortcut(), { wrapper });
    pressKey("I");

    await waitFor(() => {
      expect(selectIsSidebarOpen(useViewStore.getState())).toBe(true);
      expect(document.activeElement).toBe(item);
    });
  });

  it("focuses the first item directly with I when already open", async () => {
    viewActions.setSidebarOpen(true);
    const item = addSidebarItem();

    renderHook(() => useFocusSidebarShortcut(), { wrapper });
    pressKey("I");

    await waitFor(() => {
      expect(document.activeElement).toBe(item);
    });
  });
});
