import { type Calendar } from "@core/types/calendar.contracts";
import { type CalendarId } from "@core/types/domain-primitives";
import { type SyncConnectionSummary } from "@core/types/user.types";
import { BookingCheckboxRow } from "@web/booking/BookingCheckboxRow";
import { bookingFieldAttrs } from "@web/booking/booking-sequence.fields";
import {
  accountKey,
  accountLabel,
  groupCalendarsByAccount,
} from "@web/calendars/calendar.util";

interface BookingBlockingCalendarsFieldProps {
  availabilityCalendars: Calendar[];
  blockingCalendarIds: readonly CalendarId[];
  connections: SyncConnectionSummary[];
  onToggle: (calendarId: CalendarId, checked: boolean) => void;
}

export function BookingBlockingCalendarsField({
  availabilityCalendars,
  blockingCalendarIds,
  connections,
  onToggle,
}: BookingBlockingCalendarsFieldProps) {
  const blockingSet = new Set(blockingCalendarIds);
  const { groups, ungrouped } = groupCalendarsByAccount(
    availabilityCalendars,
    connections,
  );
  const groupsWithCalendars = groups.filter(
    (group) => group.calendars.length > 0,
  );
  const showAccountCaption = groupsWithCalendars.length > 1;

  const renderBlockingCalendar = (calendar: Calendar) => (
    <BookingCheckboxRow
      checked={blockingSet.has(calendar.id)}
      key={calendar.id}
      onChange={(checked) => onToggle(calendar.id, checked)}
    >
      {calendar.name}
    </BookingCheckboxRow>
  );

  return (
    <fieldset
      className="flex flex-col gap-2"
      {...bookingFieldAttrs("blocking")}
    >
      <legend className="mb-1 text-sm text-text">Blocking calendars</legend>
      {availabilityCalendars.length === 0 ? (
        <p className="text-sm text-text-muted">No calendars available.</p>
      ) : (
        <>
          {groupsWithCalendars.map((group) => (
            <div
              className="flex min-w-0 flex-col gap-2"
              key={accountKey(group)}
            >
              {showAccountCaption ? (
                <p className="text-text-muted text-xs">{accountLabel(group)}</p>
              ) : null}
              {group.calendars.map(renderBlockingCalendar)}
            </div>
          ))}
          {ungrouped.map(renderBlockingCalendar)}
        </>
      )}
    </fieldset>
  );
}
