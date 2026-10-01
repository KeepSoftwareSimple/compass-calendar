import {
  DESKTOP_MENU_MAC_KEY_EQUIVALENTS,
  DESKTOP_MENU_SHORTCUT_BINDINGS,
  DesktopMenuShortcutNameSchema,
} from "@core/desktop/desktop-menu-shortcuts.contract";
import { describe, expect, it } from "bun:test";

describe("DesktopMenuShortcutNameSchema", () => {
  it("accepts every menu dispatch id", () => {
    for (const name of Object.keys(DESKTOP_MENU_SHORTCUT_BINDINGS)) {
      expect(DesktopMenuShortcutNameSchema.parse(name)).toBe(name);
    }
  });
});

describe("DESKTOP_MENU_MAC_KEY_EQUIVALENTS", () => {
  it("covers the same ids as DESKTOP_MENU_SHORTCUT_BINDINGS", () => {
    expect(Object.keys(DESKTOP_MENU_MAC_KEY_EQUIVALENTS).sort()).toEqual(
      Object.keys(DESKTOP_MENU_SHORTCUT_BINDINGS).sort(),
    );
  });
});
