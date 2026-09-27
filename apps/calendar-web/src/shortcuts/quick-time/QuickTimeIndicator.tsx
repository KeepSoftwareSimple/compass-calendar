import { type FC } from "react";
import {
  selectQuickTimeDigits,
  useEventJumpStore,
} from "@web/shortcuts/shift-hint/event-jump.store";
import { ShortcutTipParts } from "@web/shortcuts/tips/ShortcutTipParts";
import { type ShortcutTipPart } from "@web/shortcuts/tips/shortcut-tips.data";

export const quickTimeHintParts = (
  digits: string,
): readonly ShortcutTipPart[] => [
  "New event at ",
  digits.padEnd(4, "_"),
  " · ",
  { key: "Esc" },
];

/**
 * Echoes a half-typed start time so `11` is visibly waiting for its minutes
 * rather than looking like a dropped keystroke. Separate from
 * EventJumpIndicator because typing a time never requires `h`, and that
 * indicator only renders while jump mode is on.
 */
export const QuickTimeIndicator: FC = () => {
  const digits = useEventJumpStore(selectQuickTimeDigits);

  if (!digits) return null;

  return (
    <span
      aria-live="polite"
      className="block w-full text-pretty break-words text-center text-text-muted text-xs leading-5 opacity-80"
      data-quick-time-indicator=""
      role="status"
    >
      <ShortcutTipParts parts={quickTimeHintParts(digits)} />
    </span>
  );
};
