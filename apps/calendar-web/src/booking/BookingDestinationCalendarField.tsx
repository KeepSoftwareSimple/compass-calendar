import { BOOKING_PLACEHOLDER_CALENDAR_ID } from "@core/types/booking.contracts";
import { type Calendar } from "@core/types/calendar.contracts";
import { type CalendarId } from "@core/types/domain-primitives";
import { type SyncConnectionSummary } from "@core/types/user.types";
import {
  bookingDestinationConferenceHint,
  formatBookingDestinationOptionLabel,
} from "@web/booking/booking-conference.copy";
import { BOOKING_SELECT_CLASS_NAME } from "@web/booking/booking-form.styles";
import {
  type BookingField,
  bookingFieldAttrs,
} from "@web/booking/booking-sequence.fields";
import { AccountGroupedCalendarOptions } from "@web/calendars/AccountGroupedCalendarOptions";

interface BookingDestinationCalendarFieldProps {
  connections: SyncConnectionSummary[];
  /** Sequence attributes for host settings; the wizard step has no field sequence. */
  field?: BookingField;
  id: string;
  onChange: (destinationCalendarId: CalendarId) => void;
  value: CalendarId;
  writableCalendars: Calendar[];
}

/**
 * The destination `<select>` plus the hint explaining that the chosen calendar
 * cannot mint a video link. Shared by host settings and the first-run wizard so
 * the hint and its `aria-describedby` can never drift apart.
 */
export function BookingDestinationCalendarField({
  connections,
  field,
  id,
  onChange,
  value,
  writableCalendars,
}: BookingDestinationCalendarFieldProps) {
  const destinationCalendar = writableCalendars.find(
    (calendar) => calendar.id === value,
  );
  const conferenceHint = destinationCalendar
    ? bookingDestinationConferenceHint(destinationCalendar)
    : null;
  const hintId = `${id}-meet-warning`;

  return (
    <>
      <select
        {...(field ? bookingFieldAttrs(field) : {})}
        aria-describedby={conferenceHint ? hintId : undefined}
        className={BOOKING_SELECT_CLASS_NAME}
        id={id}
        onChange={(event) => onChange(event.target.value as CalendarId)}
        value={value}
      >
        {writableCalendars.length === 0 ? (
          <option value={BOOKING_PLACEHOLDER_CALENDAR_ID}>
            No writable calendars
          </option>
        ) : (
          <AccountGroupedCalendarOptions
            calendars={writableCalendars}
            connections={connections}
            optionLabel={formatBookingDestinationOptionLabel}
          />
        )}
      </select>
      {conferenceHint ? (
        <p className="mt-1 text-sm text-warning" id={hintId} role="status">
          {conferenceHint}
        </p>
      ) : null}
    </>
  );
}
