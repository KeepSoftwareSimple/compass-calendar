import { type CalendarCardIdentity } from "@web/calendars/useCalendarLookup";
import { calendarAccentStyle } from "@web/grid/components/calendar-accent.util";

/**
 * The left edge bar that marks which calendar a card belongs to. Merged cards
 * paint their calendars into the fill gradient instead and render no stripe
 * (A5); the accessible name carries the calendar name in both cases.
 */
export const CalendarAccentStripe = ({
  identity,
}: {
  identity: CalendarCardIdentity;
}) => (
  <div
    aria-hidden="true"
    className="absolute inset-y-0 left-0 w-[3px]"
    style={calendarAccentStyle(identity)}
  />
);
