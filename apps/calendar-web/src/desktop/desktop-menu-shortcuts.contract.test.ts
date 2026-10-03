import {
  DESKTOP_MENU_MAC_KEY_EQUIVALENTS,
  DESKTOP_MENU_SHORTCUT_BINDINGS,
} from "@core/desktop/desktop-menu-shortcuts.contract";
import { APP_SHORTCUT_BINDINGS } from "@core/shortcuts/app-shortcut-bindings";
import { KEYMAP } from "@core/shortcuts/keymap";
import { describe, expect, it } from "bun:test";

describe("desktop menu shortcut bindings vs web keymap", () => {
  it("matches taught navigation and create bindings", () => {
    expect(DESKTOP_MENU_SHORTCUT_BINDINGS["nav-today"].hotkey).toBe(
      APP_SHORTCUT_BINDINGS.navToday.hotkey,
    );
    expect(DESKTOP_MENU_SHORTCUT_BINDINGS["nav-day-view"].hotkey).toBe(
      APP_SHORTCUT_BINDINGS.navDayView.hotkey,
    );
    expect(DESKTOP_MENU_SHORTCUT_BINDINGS["nav-week-view"].hotkey).toBe(
      APP_SHORTCUT_BINDINGS.navWeekView.hotkey,
    );
    expect(DESKTOP_MENU_SHORTCUT_BINDINGS["create-timed"].hotkey).toBe(
      KEYMAP.createEvent.hotkey,
    );
    expect(DESKTOP_MENU_SHORTCUT_BINDINGS["other-palette"].hotkey).toBe(
      KEYMAP.commandPalette.hotkey,
    );
    expect(DESKTOP_MENU_SHORTCUT_BINDINGS["other-settings"].hotkey).toBe(
      APP_SHORTCUT_BINDINGS.otherSettings.hotkey,
    );
  });

  it("covers every mac key equivalent entry", () => {
    expect(Object.keys(DESKTOP_MENU_MAC_KEY_EQUIVALENTS).sort()).toEqual(
      Object.keys(DESKTOP_MENU_SHORTCUT_BINDINGS).sort(),
    );
  });
});
