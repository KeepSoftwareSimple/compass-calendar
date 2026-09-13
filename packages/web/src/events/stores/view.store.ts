import { create } from "zustand";
import { devtools } from "zustand/middleware";
import dayjs from "@core/util/date/dayjs";
import { IS_DEV } from "@web/common/constants/env.constants";
import {
  readSidebarOpen,
  writeSidebarOpen,
} from "@web/common/storage/sidebar-open.storage";
import { readBootSidebarOpen } from "@web/common/utils/boot-geometry.util";

interface ViewState {
  dates: {
    start: string;
    end: string;
  };
  sidebar: {
    // What's rendered right now - can differ from `preference` while a
    // narrow-viewport breakpoint auto-collapses the sidebar.
    isOpen: boolean;
    // The user's last explicit choice; the only field this store persists.
    preference: boolean;
  };
  shortcuts: {
    isOpen: boolean;
  };
}

const persistedSidebarPreference = readSidebarOpen();

export const initialViewState: ViewState = {
  dates: {
    start: dayjs().startOf("week").format(),
    end: dayjs().endOf("week").format(),
  },
  // Seed isOpen from the boot shell when present so a narrow first paint
  // never mounts the sidebar open and then animates it closed. Preference
  // stays the persisted choice; useResponsiveLayout still restores it when
  // the viewport is wide enough.
  sidebar: {
    isOpen: readBootSidebarOpen(persistedSidebarPreference),
    preference: persistedSidebarPreference,
  },
  shortcuts: { isOpen: false },
};

// Selectors passed to this hook must return primitives or stable references;
// a selector that builds a new object/array each call needs `useShallow`.
export const useViewStore = create<ViewState>()(
  devtools(() => initialViewState, {
    name: "compass/view",
    enabled: IS_DEV,
  }),
);

// Two self-correcting invariants, checked after every update so no future
// write path can violate them by forgetting a special case:
// - `preference` is the only field ever persisted (`syncSidebarOpen`, used
//   for breakpoint crossings, never touches it, so it never reaches here).
// - The shortcuts overlay lives inside the sidebar, so it can't stay open
//   once the sidebar closes.
useViewStore.subscribe((state, prevState) => {
  if (state.sidebar.preference !== prevState.sidebar.preference) {
    writeSidebarOpen(state.sidebar.preference);
  }
  if (!state.sidebar.isOpen && state.shortcuts.isOpen) {
    useViewStore.setState({ shortcuts: { isOpen: false } }, false, {
      type: "autoCloseShortcuts",
    });
  }
});

export const viewActions = {
  /** An explicit user choice (toggle button, close button, `i` shortcut): renders and persists. */
  setSidebarOpen: (isOpen: boolean) =>
    useViewStore.setState({ sidebar: { isOpen, preference: isOpen } }, false, {
      type: "setSidebarOpen",
    }),
  /** A breakpoint crossing auto-collapsing/-restoring the sidebar: renders only, leaves the saved preference untouched. */
  syncSidebarOpen: (isOpen: boolean) =>
    useViewStore.setState(
      (state) => ({ sidebar: { ...state.sidebar, isOpen } }),
      false,
      { type: "syncSidebarOpen" },
    ),
  toggleSidebar: () =>
    useViewStore.setState(
      (state) => {
        const isOpen = !state.sidebar.isOpen;
        return { sidebar: { isOpen, preference: isOpen } };
      },
      false,
      { type: "toggleSidebar" },
    ),
  /** `?` / `/`: opens the sidebar first if it's closed, otherwise toggles the overlay. */
  toggleShortcuts: () => {
    const wasSidebarOpen = useViewStore.getState().sidebar.isOpen;
    if (!wasSidebarOpen) viewActions.setSidebarOpen(true);

    useViewStore.setState(
      (state) => ({
        shortcuts: { isOpen: wasSidebarOpen ? !state.shortcuts.isOpen : true },
      }),
      false,
      { type: "toggleShortcuts" },
    );
  },
  closeShortcuts: () =>
    useViewStore.setState({ shortcuts: { isOpen: false } }, false, {
      type: "closeShortcuts",
    }),
  updateDates: (dates: ViewState["dates"]) =>
    useViewStore.setState({ dates }, false, { type: "updateDates" }),
};
export const selectIsSidebarOpen = (state: ViewState) => state.sidebar.isOpen;
export const selectSidebarPreference = (state: ViewState) =>
  state.sidebar.preference;
export const selectIsShortcutsOpen = (state: ViewState) =>
  state.shortcuts.isOpen;
