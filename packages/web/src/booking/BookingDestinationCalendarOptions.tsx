import { type Calendar } from "@core/types/calendar.contracts";
import { type SyncConnectionSummary } from "@core/types/user.types";
import { formatBookingDestinationOptionLabel } from "@web/booking/booking-conference.copy";
import { groupCalendarsByAccount } from "@web/calendars/calendar.util";

interface BookingDestinationCalendarOptionsProps {
  calendars: Calendar[];
  connections: SyncConnectionSummary[];
}

export function BookingDestinationCalendarOptions({
  calendars,
  connections,
}: BookingDestinationCalendarOptionsProps) {
  const { groups, ungrouped } = groupCalendarsByAccount(calendars, connections);
  return (
    <>
      {groups
        .filter((group) => group.calendars.length > 0)
        .map((group) => (
          <optgroup key={group.key} label={group.accountEmail}>
            {group.calendars.map((calendar) => (
              <option key={calendar.id} value={calendar.id}>
                {formatBookingDestinationOptionLabel(calendar)}
              </option>
            ))}
          </optgroup>
        ))}
      {ungrouped.map((calendar) => (
        <option key={calendar.id} value={calendar.id}>
          {formatBookingDestinationOptionLabel(calendar)}
        </option>
      ))}
    </>
  );
}
