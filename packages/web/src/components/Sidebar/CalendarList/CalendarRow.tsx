import { type FC } from "react";
import { type Calendar } from "@core/types/calendar.contracts";
import { ShortcutHint } from "@web/components/Shortcuts/ShortcutHint";

export const calendarRowDisplayName = (
  calendar: Calendar,
  label?: string,
): string => label ?? (calendar.isPrimary ? "primary" : calendar.name);

export const CalendarRow: FC<{
  calendar: Calendar;
  label?: string;
  onToggle: (calendar: Calendar, displayName: string) => void;
  pickKey?: string;
}> = ({ calendar, label, onToggle, pickKey }) => {
  // If an explicit label is provided, use it (for ungrouped rows that have no
  // account heading). Otherwise, a primary calendar's row reads "primary"
  // instead of repeating the account name already in the section heading.
  const displayName = calendarRowDisplayName(calendar, label);

  return (
    <li className="flex min-w-0 items-center gap-1">
      <button
        aria-keyshortcuts={pickKey}
        aria-label={`${calendar.isVisible ? "Hide" : "Show"} ${displayName} calendar`}
        aria-pressed={calendar.isVisible}
        className="c-focus-ring flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-0.5 text-left text-text-muted text-xs hover:bg-surface-panel hover:text-text"
        onClick={() => onToggle(calendar, displayName)}
        type="button"
      >
        <span
          aria-hidden
          className="size-3.5 shrink-0 rounded-full border-2 transition-[background-color,border-color] motion-reduce:transition-none"
          style={{
            backgroundColor: calendar.isVisible
              ? calendar.backgroundColor
              : "transparent",
            borderColor: calendar.backgroundColor,
          }}
        />
        <span className="min-w-0 flex-1 truncate">{displayName}</span>
        {pickKey ? (
          <ShortcutHint className="shrink-0">{pickKey}</ShortcutHint>
        ) : null}
      </button>
    </li>
  );
};
