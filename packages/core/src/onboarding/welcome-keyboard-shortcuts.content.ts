import { APP_SHORTCUT_BINDINGS } from "@core/shortcuts/app-shortcut-bindings";
import { KEYMAP } from "@core/shortcuts/keymap";

export type WelcomeKeyboardShortcutRow = {
  readonly label: string;
  readonly keycaps: readonly string[];
};

/** Rows for welcome step 4; keycaps match live calendar bindings (max three keys). */
export const WELCOME_KEYBOARD_SHORTCUT_ROWS: readonly WelcomeKeyboardShortcutRow[] =
  [
    {
      label: "Create an event",
      keycaps: KEYMAP.createEvent.keycaps,
    },
    {
      label: "Open the command palette",
      keycaps: KEYMAP.commandPalette.keycaps,
    },
    {
      label: "Show every shortcut",
      keycaps: APP_SHORTCUT_BINDINGS.otherShortcuts.keycaps,
    },
    {
      label: "Go to today",
      keycaps: APP_SHORTCUT_BINDINGS.navToday.keycaps,
    },
  ] as const;

export const WELCOME_KEYBOARD_SHORTCUTS_TITLE = "Essential shortcuts";

export const WELCOME_KEYBOARD_SHORTCUTS_SUBTITLE =
  "These keys work on your calendar as soon as you continue.";

export const WELCOME_KEYBOARD_SHORTCUTS_CONTINUE_LABEL = "Continue to calendar";
