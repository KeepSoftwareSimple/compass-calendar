import {
  WELCOME_KEYBOARD_SHORTCUT_ROWS,
  WELCOME_KEYBOARD_SHORTCUTS_CONTINUE_LABEL,
  WELCOME_KEYBOARD_SHORTCUTS_SUBTITLE,
  WELCOME_KEYBOARD_SHORTCUTS_TITLE,
} from "@core/onboarding/welcome-keyboard-shortcuts.content";
import { describe, expect, it } from "bun:test";

describe("welcome keyboard shortcuts content", () => {
  it("uses at most three keycaps per row", () => {
    for (const row of WELCOME_KEYBOARD_SHORTCUT_ROWS) {
      expect(row.keycaps.length).toBeLessThanOrEqual(3);
      expect(row.label.length).toBeGreaterThan(0);
    }
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
