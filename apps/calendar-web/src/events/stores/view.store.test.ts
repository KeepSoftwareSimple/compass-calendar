import { STORAGE_KEYS } from "@web/common/constants/storage.constants";
import {
  initialViewState,
  selectIsShortcutsOpen,
  selectIsSidebarOpen,
  selectSidebarPreference,
  useViewStore,
  viewActions,
} from "@web/events/stores/view.store";
import { beforeEach, describe, expect, it } from "bun:test";

describe("view.store sidebar persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    useViewStore.setState(initialViewState, true);
  });

  it("toggleSidebar persists the new preference", () => {
    viewActions.toggleSidebar();

    expect(selectIsSidebarOpen(useViewStore.getState())).toBe(false);
    expect(selectSidebarPreference(useViewStore.getState())).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.SIDEBAR_OPEN)).toBe("false");
  });

  it("setSidebarOpen persists the new preference", () => {
    viewActions.setSidebarOpen(false);

    expect(selectIsSidebarOpen(useViewStore.getState())).toBe(false);
    expect(selectSidebarPreference(useViewStore.getState())).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.SIDEBAR_OPEN)).toBe("false");
  });

  it("syncSidebarOpen renders without touching the saved preference", () => {
    viewActions.syncSidebarOpen(false);

    expect(selectIsSidebarOpen(useViewStore.getState())).toBe(false);
    expect(selectSidebarPreference(useViewStore.getState())).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.SIDEBAR_OPEN)).toBeNull();

    viewActions.syncSidebarOpen(true);

    expect(selectIsSidebarOpen(useViewStore.getState())).toBe(true);
    expect(selectSidebarPreference(useViewStore.getState())).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.SIDEBAR_OPEN)).toBeNull();
  });

  it("a breakpoint crossing never overwrites a preference set while narrow", () => {
    // User explicitly closes the sidebar (persists), then narrows the
    // viewport (auto-collapse, no-op here since it's already closed) and
    // widens it again - useResponsiveLayout reads the still-closed
    // preference rather than force-opening.
    viewActions.setSidebarOpen(false);
    viewActions.syncSidebarOpen(false);
    viewActions.syncSidebarOpen(
      selectSidebarPreference(useViewStore.getState()),
    );

    expect(selectIsSidebarOpen(useViewStore.getState())).toBe(false);
    expect(selectSidebarPreference(useViewStore.getState())).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.SIDEBAR_OPEN)).toBe("false");
  });
});

describe("view.store shortcuts overlay", () => {
  beforeEach(() => {
    localStorage.clear();
    useViewStore.setState(initialViewState, true);
  });

  it("toggleShortcuts opens the sidebar first when it's closed", () => {
    viewActions.setSidebarOpen(false);

    viewActions.toggleShortcuts();

    expect(selectIsSidebarOpen(useViewStore.getState())).toBe(true);
    expect(selectIsShortcutsOpen(useViewStore.getState())).toBe(true);
  });

  it("toggleShortcuts just toggles the overlay when the sidebar is already open", () => {
    viewActions.setSidebarOpen(true);

    viewActions.toggleShortcuts();
    expect(selectIsShortcutsOpen(useViewStore.getState())).toBe(true);

    viewActions.toggleShortcuts();
    expect(selectIsShortcutsOpen(useViewStore.getState())).toBe(false);
  });

  it("closing the sidebar through any action also closes the overlay", () => {
    viewActions.setSidebarOpen(true);
    viewActions.toggleShortcuts();
    expect(selectIsShortcutsOpen(useViewStore.getState())).toBe(true);

    viewActions.toggleSidebar();

    expect(selectIsSidebarOpen(useViewStore.getState())).toBe(false);
    expect(selectIsShortcutsOpen(useViewStore.getState())).toBe(false);
  });

  it("a breakpoint auto-collapse also closes the overlay", () => {
    viewActions.setSidebarOpen(true);
    viewActions.toggleShortcuts();
    expect(selectIsShortcutsOpen(useViewStore.getState())).toBe(true);

    viewActions.syncSidebarOpen(false);

    expect(selectIsShortcutsOpen(useViewStore.getState())).toBe(false);
  });
});
