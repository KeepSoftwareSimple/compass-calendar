import {
  type BookingDurationMinutes,
  type WeeklyAvailability,
} from "@core/types/booking.contracts";
import { type Calendar } from "@core/types/calendar.contracts";
import { type TimeZone } from "@core/types/domain-primitives";
import { formatBookingTimezoneLabel } from "@web/booking/BookingTimezoneField";
import { bookingAddressPrefix } from "@web/booking/booking-address.util";
import { formatBookingDestinationOptionLabel } from "@web/booking/booking-conference.copy";
import { summarizeAvailability } from "@web/booking/weekly-hours";

export const GUEST_DESTINATION_LABEL = "Your connected calendar, after sign-up";

interface BookingSetupGoLiveStepProps {
  bookingUrl: string | null;
  destinationCalendar: Calendar | undefined;
  durationMinutes: BookingDurationMinutes;
  /** Before sign-up the only calendar is the browser's local one, never the real destination. */
  guest?: boolean;
  slug: string;
  timeZone: TimeZone;
  weeklyAvailability: WeeklyAvailability;
}

export function BookingSetupGoLiveStep({
  bookingUrl,
  destinationCalendar,
  durationMinutes,
  guest = false,
  slug,
  timeZone,
  weeklyAvailability,
}: BookingSetupGoLiveStepProps) {
  const prefix = bookingAddressPrefix(bookingUrl);
  const hoursSummary = summarizeAvailability(weeklyAvailability);
  const destinationLabel = guest
    ? GUEST_DESTINATION_LABEL
    : destinationCalendar
      ? formatBookingDestinationOptionLabel(destinationCalendar)
      : "No writable calendars";

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm text-text">
      <dt className="text-text-muted">Link</dt>
      <dd className="break-all">
        {prefix}
        {slug}
      </dd>
      <dt className="text-text-muted">Hours</dt>
      <dd>{hoursSummary}</dd>
      <dt className="text-text-muted">Timezone</dt>
      <dd>{formatBookingTimezoneLabel(timeZone)}</dd>
      <dt className="text-text-muted">Duration</dt>
      <dd>{durationMinutes} minutes</dd>
      <dt className="text-text-muted">Destination</dt>
      <dd>{destinationLabel}</dd>
    </dl>
  );
}
