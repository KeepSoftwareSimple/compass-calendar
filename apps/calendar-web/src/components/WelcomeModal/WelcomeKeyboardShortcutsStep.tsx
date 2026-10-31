import {
  WELCOME_KEYBOARD_SHORTCUT_ROWS,
  WELCOME_KEYBOARD_SHORTCUTS_SUBTITLE,
  WELCOME_KEYBOARD_SHORTCUTS_TITLE,
} from "@core/onboarding/welcome-keyboard-shortcuts.content";
import { ShortcutKeys } from "@web/components/Shortcuts/ShortcutKeys";

export function WelcomeKeyboardShortcutsStep() {
  return (
    <>
      <div className="flex w-full flex-col gap-2">
        <h2 className="font-bold text-2xl text-text leading-snug">
          {WELCOME_KEYBOARD_SHORTCUTS_TITLE}
        </h2>
        <p className="text-text-muted">{WELCOME_KEYBOARD_SHORTCUTS_SUBTITLE}</p>
      </div>
      <ul className="flex w-full flex-col gap-3">
        {WELCOME_KEYBOARD_SHORTCUT_ROWS.map((row) => (
          <li
            key={row.label}
            className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
          >
            <span className="text-sm text-text">{row.label}</span>
            <ShortcutKeys className="shrink-0" keys={[...row.keycaps]} />
          </li>
        ))}
      </ul>
    </>
  );
}
