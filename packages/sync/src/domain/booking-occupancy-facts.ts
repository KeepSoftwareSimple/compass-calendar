import { type BookingOccupancyFacts } from "@core/booking/occupies-booking-slot";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";

/**
 * Facts only: whether this event's host identity matches the organizer or
 * an attendee, and that attendee's response. Booking decides occupancy.
 * A missing event (occurrence-only fixture) is treated as host-organized.
 */
export const occupancyFactsForEvent = (
  event: EventRecord | undefined,
  accountEmail: string | null,
): BookingOccupancyFacts => {
  if (!event) {
    return { hostIsOrganizer: true, hostResponseStatus: null };
  }

  const self = accountEmail?.trim().toLowerCase() ?? null;
  const organizerEmail = event.content.organizer?.email.trim().toLowerCase();
  const hostIsOrganizer =
    organizerEmail === undefined || organizerEmail === self;
  const selfAttendee = self
    ? event.content.attendees?.find(
        (attendee) => attendee.email.trim().toLowerCase() === self,
      )
    : undefined;

  return {
    hostIsOrganizer,
    hostResponseStatus: selfAttendee?.responseStatus ?? null,
  };
};
