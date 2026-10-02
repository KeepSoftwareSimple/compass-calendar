import { type FocusEvent, type KeyboardEvent, useState } from "react";
import { type Calendar } from "@core/types/calendar.contracts";
import {
  digitPickIndex,
  digitPickOwnerAttrs,
  PICK_KEY_LABELS,
} from "@web/shortcuts/digit-pick.util";
import { recordHandledShortcutInvocation } from "@web/shortcuts/tips/shortcut-telemetry";

/**
 * Digit-pick for a focused calendar-account section: 1-9, 0, -, = map to
 * the first 12 rows. Chips and aria-keyshortcuts follow `focusedWithin`.
 *
 * The section is marked as the bare-digit owner so the grid's typed-time
 * creation (a capture-phase document listener that would otherwise win)
 * leaves digits pressed inside it alone. Everything else stays global:
 * `c` still creates, `h` still enters jump mode, Mod+digit still page-jumps.
 */
export function useCalendarDigitPick({
  calendars,
  onPick,
}: {
  calendars: readonly Calendar[];
  onPick: (calendar: Calendar) => void;
}) {
  const [focusedWithin, setFocusedWithin] = useState(false);

  const sectionProps = {
    ...digitPickOwnerAttrs(),
    onFocus: () => setFocusedWithin(true),
    onBlur: (event: FocusEvent<HTMLElement>) => {
      const next = event.relatedTarget;
      if (next instanceof Node && event.currentTarget.contains(next)) return;
      setFocusedWithin(false);
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      const index = digitPickIndex(event);
      if (index === null) return;
      const calendar = calendars[index];
      if (!calendar) return;

      event.preventDefault();
      event.stopPropagation();
      onPick(calendar);
      recordHandledShortcutInvocation("focus-calendar-digit");
    },
  };

  const pickKeyFor = (index: number) =>
    focusedWithin && index < PICK_KEY_LABELS.length
      ? PICK_KEY_LABELS[index]
      : undefined;

  return { focusedWithin, pickKeyFor, sectionProps };
}
