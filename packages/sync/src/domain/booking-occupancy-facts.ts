import { type BookingOccupancyFacts } from "@core/booking/occupies-booking-slot";
import { type AttendeeResponseStatus } from "@core/types/event-attendance.contracts";

// The slice of an event occupancyFactsForEvent reads. A projected hydrate
// must not need the rest of the event document.
export interface OccupancyEventFacts {
  content: {
    organizer?: { email: string } | null;
    attendees: readonly {
      email: string;
      responseStatus: AttendeeResponseStatus;
    }[];
  };
}

/**
 * Facts only: whether this event's host identity matches the organizer or
 * an attendee, and that attendee's response. Booking decides occupancy.
 * A missing event (occurrence-only fixture) is treated as host-organized.
 */
export const occupancyFactsForEvent = (
  event: OccupancyEventFacts | undefined,
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
    ? event.content.attendees.find(
        (attendee) => attendee.email.trim().toLowerCase() === self,
      )
    : undefined;

  return {
    hostIsOrganizer,
    hostResponseStatus: selfAttendee?.responseStatus ?? null,
  };
};
