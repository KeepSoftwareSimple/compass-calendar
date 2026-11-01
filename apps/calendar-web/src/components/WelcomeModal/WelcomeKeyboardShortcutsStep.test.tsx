import { render, screen } from "@testing-library/react";
import {
  WELCOME_KEYBOARD_SHORTCUT_ROWS,
  WELCOME_KEYBOARD_SHORTCUTS_TITLE,
} from "@core/onboarding/welcome-keyboard-shortcuts.content";
import { WelcomeKeyboardShortcutsStep } from "@web/components/WelcomeModal/WelcomeKeyboardShortcutsStep";
import { describe, expect, it } from "bun:test";

describe("WelcomeKeyboardShortcutsStep", () => {
  it("lists every onboarding shortcut row with keycaps", () => {
    render(<WelcomeKeyboardShortcutsStep />);
    expect(
      screen.getByRole("heading", { name: WELCOME_KEYBOARD_SHORTCUTS_TITLE }),
    ).toBeTruthy();
    for (const row of WELCOME_KEYBOARD_SHORTCUT_ROWS) {
      expect(screen.getByText(row.label)).toBeTruthy();
    }
  });
});
