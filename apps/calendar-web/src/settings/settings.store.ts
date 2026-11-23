import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { IS_DEV } from "@web/common/constants/env.constants";

export type SettingsPage = "accounts" | "billing" | "booking" | "notifications";

/** A control Settings should focus once when opened from a link. */
export type SettingsFocus = "weekly-reflection";

export type OpenFromPaletteOptions = {
  fromPalette?: boolean;
};

interface SettingsState {
  isCmdPaletteOpen: boolean;
  /** Quick-add panel opens the palette focused on creating events. */
  cmdPaletteCreateMode: boolean;
  isSettingsOpen: boolean;
  isAboutOpen: boolean;
  settingsPage: SettingsPage;
  settingsFocus: SettingsFocus | null;
  /** True when the current overlay was opened from the command palette. */
  overlayOpenedFromPalette: boolean;
  /** Public /meet footer CTA: preview setup before sign-up. */
  guestMeetingSetupActive: boolean;
  /**
   * Settings closed under the sign-up modal during the guest hand-off. The
   * auth modal already owns focus, so Settings must not restore its own.
   */
  closedForGuestAuthHandoff: boolean;
}

export const initialSettingsState: SettingsState = {
  isCmdPaletteOpen: false,
  cmdPaletteCreateMode: false,
  isSettingsOpen: false,
  isAboutOpen: false,
  settingsPage: "accounts",
  settingsFocus: null,
  overlayOpenedFromPalette: false,
  guestMeetingSetupActive: false,
  closedForGuestAuthHandoff: false,
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
    useSettingsStore.setState(
      { isCmdPaletteOpen: false, cmdPaletteCreateMode: false },
      false,
      {
        type: "closeCmdPalette",
      },
    ),
  openCmdPalette: () =>
    useSettingsStore.setState(
      { isCmdPaletteOpen: true, cmdPaletteCreateMode: false },
      false,
      {
        type: "openCmdPalette",
      },
    ),
  openCmdPaletteCreateMode: () =>
    useSettingsStore.setState(
      { isCmdPaletteOpen: true, cmdPaletteCreateMode: true },
      false,
      { type: "openCmdPaletteCreateMode" },
    ),
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
        settingsFocus: null,
        overlayOpenedFromPalette: false,
        guestMeetingSetupActive: false,
      },
      false,
      {
        type: "closeSettings",
      },
    ),
  /**
   * Closes Settings for guest sign-up hand-off; keeps the local draft intent.
   * Call after the sign-up modal is open so the backdrop never drops between
   * the two dialogs.
   */
  closeSettingsForGuestAuthHandoff: () =>
    useSettingsStore.setState(
      {
        isSettingsOpen: false,
        settingsPage: "accounts",
        overlayOpenedFromPalette: false,
        closedForGuestAuthHandoff: true,
      },
      false,
      {
        type: "closeSettingsForGuestAuthHandoff",
      },
    ),
  beginGuestMeetingSetup: () =>
    useSettingsStore.setState(
      {
        isSettingsOpen: true,
        settingsPage: "booking",
        guestMeetingSetupActive: true,
        overlayOpenedFromPalette: false,
        closedForGuestAuthHandoff: false,
      },
      false,
      { type: "beginGuestMeetingSetup" },
    ),
  clearGuestMeetingSetup: () =>
    useSettingsStore.setState({ guestMeetingSetupActive: false }, false, {
      type: "clearGuestMeetingSetup",
    }),
  openSettings: (
    page: SettingsPage = "accounts",
    {
      fromPalette = false,
      focus = null,
    }: OpenFromPaletteOptions & { focus?: SettingsFocus | null } = {},
  ) =>
    useSettingsStore.setState(
      {
        isSettingsOpen: true,
        settingsPage: page,
        settingsFocus: focus,
        overlayOpenedFromPalette: fromPalette,
        closedForGuestAuthHandoff: false,
      },
      false,
      {
        type: "openSettings",
      },
    ),
  clearSettingsFocus: () =>
    useSettingsStore.setState({ settingsFocus: null }, false, {
      type: "clearSettingsFocus",
    }),
  setSettingsPage: (settingsPage: SettingsPage) =>
    useSettingsStore.setState({ settingsPage }, false, {
      type: "setSettingsPage",
    }),
  toggleSettings: () =>
    useSettingsStore.setState(
      (state) => ({
        isSettingsOpen: !state.isSettingsOpen,
        settingsPage: "accounts",
        overlayOpenedFromPalette: false,
        closedForGuestAuthHandoff: false,
      }),
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

export const selectIsCmdPaletteCreateMode = (state: SettingsState) =>
  state.cmdPaletteCreateMode;

export const selectIsSettingsOpen = (state: SettingsState) =>
  state.isSettingsOpen;

export const selectIsAboutOpen = (state: SettingsState) => state.isAboutOpen;

export const selectSettingsPage = (state: SettingsState) => state.settingsPage;

export const selectSettingsFocus = (state: SettingsState) =>
  state.settingsFocus;

export const selectOverlayOpenedFromPalette = (state: SettingsState) =>
  state.overlayOpenedFromPalette;

export const selectGuestMeetingSetupActive = (state: SettingsState) =>
  state.guestMeetingSetupActive;
