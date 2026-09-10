import { type Calendar } from "@core/types/calendar.contracts";
import { type CalendarId } from "@core/types/domain-primitives";
import { type SyncConnectionSummary } from "@core/types/user.types";
import { ConnectProviderChooser } from "@web/auth/providers/ConnectProviderChooser";
import { BookingDestinationCalendarOptions } from "@web/booking/BookingDestinationCalendarOptions";
import { bookingDestinationConferenceHint } from "@web/booking/booking-conference.copy";
import { BOOKING_SELECT_CLASS_NAME } from "@web/booking/booking-form.styles";

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
        <BookingDestinationCalendarOptions
          calendars={writableCalendars}
          connections={connections}
        />
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
