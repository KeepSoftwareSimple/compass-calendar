import {
  WELCOME_KEYBOARD_SHORTCUT_ROWS,
  WELCOME_KEYBOARD_SHORTCUTS_CONTINUE_LABEL,
  WELCOME_KEYBOARD_SHORTCUTS_SUBTITLE,
  WELCOME_KEYBOARD_SHORTCUTS_TITLE,
} from "@core/onboarding/welcome-keyboard-shortcuts.content";
import { APP_SHORTCUT_BINDINGS } from "@core/shortcuts/app-shortcut-bindings";
import { KEYMAP } from "@core/shortcuts/keymap";
import { describe, expect, it } from "bun:test";

describe("welcome keyboard shortcuts content", () => {
  it("uses at most three keycaps per row", () => {
    for (const row of WELCOME_KEYBOARD_SHORTCUT_ROWS) {
      expect(row.keycaps.length).toBeLessThanOrEqual(3);
      expect(row.label.length).toBeGreaterThan(0);
    }
  });

  it("matches live calendar shortcut bindings", () => {
    expect(WELCOME_KEYBOARD_SHORTCUT_ROWS[0]?.keycaps).toEqual(
      KEYMAP.createEvent.keycaps,
    );
    expect(WELCOME_KEYBOARD_SHORTCUT_ROWS[1]?.keycaps).toEqual(
      KEYMAP.commandPalette.keycaps,
    );
    expect(WELCOME_KEYBOARD_SHORTCUT_ROWS[2]?.keycaps).toEqual(
      APP_SHORTCUT_BINDINGS.otherShortcuts.keycaps,
    );
    expect(WELCOME_KEYBOARD_SHORTCUT_ROWS[3]?.keycaps).toEqual(
      APP_SHORTCUT_BINDINGS.navToday.keycaps,
    );
  });

  it("keeps onboarding copy stable", () => {
    expect(WELCOME_KEYBOARD_SHORTCUTS_TITLE).toBe("Essential shortcuts");
    expect(WELCOME_KEYBOARD_SHORTCUTS_SUBTITLE).toBe(
      "These keys work on your calendar as soon as you continue.",
    );
    expect(WELCOME_KEYBOARD_SHORTCUTS_CONTINUE_LABEL).toBe(
      "Continue to calendar",
    );
  });
});
