import { type FC } from "react";
import { ShortcutTipParts } from "@web/shortcuts/tips/ShortcutTipParts";
import { type ShortcutTipPart } from "@web/shortcuts/tips/shortcut-tips.data";

export const TIME_TRAVEL_HINT_PARTS: readonly ShortcutTipPart[] = [
  "Two timezones · ",
  { key: "Esc" },
  " to exit",
];

/**
 * Contextual sidebar hint while a secondary hour column is showing:
 * Esc clears time travel from the grid.
 */
export const TimeTravelIndicator: FC = () => {
  return (
    <span
      aria-live="polite"
      className="block w-full text-pretty break-words text-center text-text-muted text-xs leading-5 opacity-80"
      role="status"
    >
      <ShortcutTipParts parts={TIME_TRAVEL_HINT_PARTS} />
    </span>
  );
};
