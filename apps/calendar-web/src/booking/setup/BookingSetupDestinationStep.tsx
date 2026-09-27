import { type Calendar } from "@core/types/calendar.contracts";
import { type CalendarId } from "@core/types/domain-primitives";
import { type SyncConnectionSummary } from "@core/types/user.types";
import { ConnectProviderChooser } from "@web/auth/providers/ConnectProviderChooser";
import { BookingDestinationCalendarField } from "@web/booking/BookingDestinationCalendarField";

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

  return (
    <div className="flex flex-col">
      <label className="sr-only" htmlFor="booking-setup-destination-calendar">
        Destination calendar
      </label>
      <BookingDestinationCalendarField
        connections={connections}
        id="booking-setup-destination-calendar"
        onChange={onChange}
        value={destinationCalendarId}
        writableCalendars={writableCalendars}
      />
    </div>
  );
}
