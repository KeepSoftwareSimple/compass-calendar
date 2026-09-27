import { type FC } from "react";
import { ShortcutTipParts } from "@web/shortcuts/tips/ShortcutTipParts";
import { type ShortcutTipPart } from "@web/shortcuts/tips/shortcut-tips.data";

export const KEYBOARD_PLACE_HINT_PARTS: readonly ShortcutTipPart[] = [
  { key: "Enter" },
  " to open",
  " · ",
  { key: "Esc" },
  " to discard",
];

/**
 * Contextual sidebar hint while a Shift+Arrow place-create draft is on the
 * grid with the form still closed: Enter opens details, Esc discards.
 */
export const KeyboardPlaceIndicator: FC = () => {
  return (
    <span
      aria-live="polite"
      className="block w-full text-pretty break-words text-center text-text-muted text-xs leading-5 opacity-80"
      data-keyboard-place-indicator=""
      role="status"
    >
      <ShortcutTipParts parts={KEYBOARD_PLACE_HINT_PARTS} />
    </span>
  );
};
