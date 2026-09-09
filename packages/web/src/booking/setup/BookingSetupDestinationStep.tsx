import { type Calendar } from "@core/types/calendar.contracts";
import { type CalendarId } from "@core/types/domain-primitives";
import { type SyncConnectionSummary } from "@core/types/user.types";
import { ConnectProviderChooser } from "@web/auth/providers/ConnectProviderChooser";
import {
  bookingDestinationConferenceHint,
  formatBookingDestinationOptionLabel,
} from "@web/booking/booking-conference.copy";
import { BOOKING_SELECT_CLASS_NAME } from "@web/booking/booking-form.styles";
import { groupCalendarsByAccount } from "@web/calendars/calendar.util";

interface BookingSetupDestinationStepProps {
  connections: SyncConnectionSummary[];
  destinationCalendarId: CalendarId;
  onChange: (destinationCalendarId: CalendarId) => void;
  writableCalendars: Calendar[];
}

export function BookingSetupDestinationStep({
  connections,
  destinationCalendarId,
  onChange,
  writableCalendars,
}: BookingSetupDestinationStepProps) {
  if (writableCalendars.length === 0) {
    return <ConnectProviderChooser variant="prompt" />;
  }

  const { groups: writableGroups, ungrouped: writableUngrouped } =
    groupCalendarsByAccount(writableCalendars, connections);
  const destinationCalendar = writableCalendars.find(
    (calendar) => calendar.id === destinationCalendarId,
  );
  const destinationConferenceHint = destinationCalendar
    ? bookingDestinationConferenceHint(destinationCalendar)
    : null;
  const destinationMeetWarningId = "booking-setup-destination-meet-warning";

  return (
    <div className="flex flex-col gap-1">
      <label className="sr-only" htmlFor="booking-setup-destination-calendar">
        Destination calendar
      </label>
      <select
        aria-describedby={
          destinationConferenceHint ? destinationMeetWarningId : undefined
        }
        className={BOOKING_SELECT_CLASS_NAME}
        id="booking-setup-destination-calendar"
        onChange={(event) => onChange(event.target.value as CalendarId)}
        value={destinationCalendarId}
      >
        {writableGroups
          .filter((group) => group.calendars.length > 0)
          .map((group) => (
            <optgroup key={group.accountEmail} label={group.accountEmail}>
              {group.calendars.map((calendar) => (
                <option key={calendar.id} value={calendar.id}>
                  {formatBookingDestinationOptionLabel(calendar)}
                </option>
              ))}
            </optgroup>
          ))}
        {writableUngrouped.map((calendar) => (
          <option key={calendar.id} value={calendar.id}>
            {formatBookingDestinationOptionLabel(calendar)}
          </option>
        ))}
      </select>
      {destinationConferenceHint ? (
        <p
          className="text-sm text-warning"
          id={destinationMeetWarningId}
          role="status"
        >
          {destinationConferenceHint}
        </p>
      ) : null}
    </div>
  );
}

export function destinationStepCanContinue(
  writableCalendarCount: number,
): boolean {
  return writableCalendarCount > 0;
}
