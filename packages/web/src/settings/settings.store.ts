import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { IS_DEV } from "@web/common/constants/env.constants";

export type SettingsPage = "accounts" | "billing" | "booking";

export type OpenFromPaletteOptions = {
  fromPalette?: boolean;
};

interface SettingsState {
  isCmdPaletteOpen: boolean;
  isSettingsOpen: boolean;
  isAboutOpen: boolean;
  settingsPage: SettingsPage;
  /** True when the current overlay was opened from the command palette. */
  overlayOpenedFromPalette: boolean;
  /** Public /meet footer CTA: preview setup before sign-up. */
  guestMeetingSetupActive: boolean;
}

export const initialSettingsState: SettingsState = {
  isCmdPaletteOpen: false,
  isSettingsOpen: false,
  isAboutOpen: false,
  settingsPage: "accounts",
  overlayOpenedFromPalette: false,
  guestMeetingSetupActive: false,
};

// Selectors passed to this hook must return primitives or stable references;
// a selector that builds a new object/array each call needs `useShallow`.
export const useSettingsStore = create<SettingsState>()(
  devtools(() => initialSettingsState, {
    name: "compass/settings",
    enabled: IS_DEV,
  }),
);

export const settingsActions = {
  closeCmdPalette: () =>
    useSettingsStore.setState({ isCmdPaletteOpen: false }, false, {
      type: "closeCmdPalette",
    }),
  openCmdPalette: () =>
    useSettingsStore.setState({ isCmdPaletteOpen: true }, false, {
      type: "openCmdPalette",
    }),
  toggleCmdPalette: () =>
    useSettingsStore.setState(
      (state) => ({ isCmdPaletteOpen: !state.isCmdPaletteOpen }),
      false,
      { type: "toggleCmdPalette" },
    ),
  closeSettings: () =>
    useSettingsStore.setState(
      {
        isSettingsOpen: false,
        settingsPage: "accounts",
        overlayOpenedFromPalette: false,
        guestMeetingSetupActive: false,
      },
      false,
      {
        type: "closeSettings",
      },
    ),
  beginGuestMeetingSetup: (resumeDraft: boolean) =>
    useSettingsStore.setState(
      {
        isSettingsOpen: true,
        settingsPage: "booking",
        guestMeetingSetupActive: true,
        overlayOpenedFromPalette: false,
      },
      false,
      { type: "beginGuestMeetingSetup", resumeDraft },
    ),
  clearGuestMeetingSetup: () =>
    useSettingsStore.setState({ guestMeetingSetupActive: false }, false, {
      type: "clearGuestMeetingSetup",
    }),
  openSettings: (
    page: SettingsPage = "accounts",
    { fromPalette = false }: OpenFromPaletteOptions = {},
  ) =>
    useSettingsStore.setState(
      {
        isSettingsOpen: true,
        settingsPage: page,
        overlayOpenedFromPalette: fromPalette,
      },
      false,
      {
        type: "openSettings",
      },
    ),
  setSettingsPage: (settingsPage: SettingsPage) =>
    useSettingsStore.setState({ settingsPage }, false, {
      type: "setSettingsPage",
    }),
  toggleSettings: () =>
    useSettingsStore.setState(
      (state) =>
        state.isSettingsOpen
          ? {
              isSettingsOpen: false,
              settingsPage: "accounts",
              overlayOpenedFromPalette: false,
            }
          : {
              isSettingsOpen: true,
              settingsPage: "accounts",
              overlayOpenedFromPalette: false,
            },
      false,
      { type: "toggleSettings" },
    ),
  closeAbout: () =>
    useSettingsStore.setState(
      { isAboutOpen: false, overlayOpenedFromPalette: false },
      false,
      {
        type: "closeAbout",
      },
    ),
  openAbout: ({ fromPalette = false }: OpenFromPaletteOptions = {}) =>
    useSettingsStore.setState(
      { isAboutOpen: true, overlayOpenedFromPalette: fromPalette },
      false,
      {
        type: "openAbout",
      },
    ),
  markOverlayOpenedFromPalette: () =>
    useSettingsStore.setState({ overlayOpenedFromPalette: true }, false, {
      type: "markOverlayOpenedFromPalette",
    }),
  clearOverlayOpenedFromPalette: () =>
    useSettingsStore.setState({ overlayOpenedFromPalette: false }, false, {
      type: "clearOverlayOpenedFromPalette",
    }),
};

/**
 * Reopen the command palette after dismissing an overlay that was opened from
 * it. Reads the origin flag before `close` so close handlers can clear it.
 */
export const reopenCommandPaletteIfNeeded = (close: () => void) => {
  const fromPalette = useSettingsStore.getState().overlayOpenedFromPalette;
  close();
  if (fromPalette) {
    useSettingsStore.setState(
      { overlayOpenedFromPalette: false, isCmdPaletteOpen: true },
      false,
      { type: "reopenCommandPaletteIfNeeded" },
    );
  }
};

export const selectIsCmdPaletteOpen = (state: SettingsState) =>
  state.isCmdPaletteOpen;

export const selectIsSettingsOpen = (state: SettingsState) =>
  state.isSettingsOpen;

export const selectIsAboutOpen = (state: SettingsState) => state.isAboutOpen;

export const selectSettingsPage = (state: SettingsState) => state.settingsPage;

export const selectOverlayOpenedFromPalette = (state: SettingsState) =>
  state.overlayOpenedFromPalette;

export const selectGuestMeetingSetupActive = (state: SettingsState) =>
  state.guestMeetingSetupActive;
