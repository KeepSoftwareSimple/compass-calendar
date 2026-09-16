import { useAppShortcut } from "@web/shortcuts/useAppShortcut";

export const MONTH_PICKER_PREV_KEYCAPS = ["Mod", "Shift", ","] as const;
export const MONTH_PICKER_NEXT_KEYCAPS = ["Mod", "Shift", "."] as const;

const MONTH_PICKER_SHORTCUT_OPTIONS = {
  ignoreInputs: true,
  preventDefault: true,
  stopPropagation: true,
} as const;

const MONTH_PICKER_PREV_OPTIONS = {
  ...MONTH_PICKER_SHORTCUT_OPTIONS,
  shortcutId: "nav-month-prev" as const,
};

const MONTH_PICKER_NEXT_OPTIONS = {
  ...MONTH_PICKER_SHORTCUT_OPTIONS,
  shortcutId: "nav-month-next" as const,
};

/**
 * Mod+Shift+, / Mod+Shift+. step the sidebar month picker's displayed month
 * the same way the chevrons do. Registered only while the picker is mounted.
 * Avoids Chrome/Edge's reserved Mod+Shift+J (Downloads / Console).
 *
 * Registered as RawHotkey objects because tanstack's string Hotkey type
 * excludes Shift+punctuation (layout-dependent event.key). US QWERTY
 * reports those chords as `<` / `>`, so both shapes are bound.
 */
export function useMonthPickerShortcuts({
  onPrevMonth,
  onNextMonth,
}: {
  onPrevMonth: () => void;
  onNextMonth: () => void;
}) {
  useAppShortcut(
    { key: ",", mod: true, shift: true },
    onPrevMonth,
    MONTH_PICKER_PREV_OPTIONS,
  );
  useAppShortcut(
    { key: "<", mod: true, shift: true },
    onPrevMonth,
    MONTH_PICKER_PREV_OPTIONS,
  );
  useAppShortcut(
    { key: ".", mod: true, shift: true },
    onNextMonth,
    MONTH_PICKER_NEXT_OPTIONS,
  );
  useAppShortcut(
    { key: ">", mod: true, shift: true },
    onNextMonth,
    MONTH_PICKER_NEXT_OPTIONS,
  );
}
