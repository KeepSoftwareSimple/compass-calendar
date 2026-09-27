import { type ComponentProps, type ReactNode } from "react";
import { type Calendar } from "@core/types/calendar.contracts";
import {
  CalendarRow,
  calendarRowDisplayName,
} from "@web/components/Sidebar/CalendarList/CalendarRow";
import { useCalendarDigitPick } from "@web/components/Sidebar/CalendarList/useCalendarDigitPick";

export function CalendarDigitListSection({
  calendars,
  children,
  listId,
  onToggle,
  rowLabel,
  ...sectionProps
}: {
  calendars: Calendar[];
  children?: ReactNode;
  listId?: string;
  onToggle: (calendar: Calendar, displayName: string) => void;
  rowLabel?: (calendar: Calendar) => string | undefined;
} & Omit<ComponentProps<"section">, "onToggle">) {
  const { pickKeyFor, sectionProps: digitProps } = useCalendarDigitPick({
    calendars,
    onPick: (calendar) => {
      const displayName = calendarRowDisplayName(
        calendar,
        rowLabel?.(calendar),
      );
      onToggle(calendar, displayName);
    },
  });

  return (
    <section {...sectionProps} {...digitProps}>
      {children}
      {calendars.length > 0 ? (
        <ul className="flex flex-col gap-1.5" id={listId}>
          {calendars.map((calendar, index) => (
            <CalendarRow
              calendar={calendar}
              key={calendar.id}
              label={rowLabel?.(calendar)}
              onToggle={onToggle}
              pickKey={pickKeyFor(index)}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
