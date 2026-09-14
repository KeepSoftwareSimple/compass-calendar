import {
  type CalendarId,
  type DateTime,
  type EventId,
} from "@core/types/domain-primitives";
import { type BusyAvailabilityResponse } from "@core/types/sync/availability.contracts";

// Google reconcile treats a resource as stale after 15 minutes and sweeps
// every 10 minutes, so lastSuccessAt on a quiet calendar can be ~25 minutes
// old while the connection is still healthy. Holiday and other unwatchable
// calendars only advance on that sweep. A 5-minute booking maxAge marked
// those hosts unbookable for most of the day.
export const BOOKING_CONFIRMATION_MAX_AGE_MS = 30 * 60 * 1000;

export interface BookingEventGuest {
  email: string;
  displayName: string | null;
}

export interface CalendarBookingGetAvailabilityInput {
  calendarIds: readonly CalendarId[];
  start: DateTime;
  end: DateTime;
  maxAgeMs?: number;
  excludeEventIds?: readonly EventId[];
}

export interface CalendarBookingCreateEventInput {
  calendarId: CalendarId;
  title: string;
  description: string;
  start: DateTime;
  end: DateTime;
  timeZone: string;
  guest: BookingEventGuest;
  createConference: boolean;
  eventId?: EventId;
}

export interface CalendarBookingDeleteEventInput {
  eventId: EventId;
}

export interface CalendarBookingUpdateEventInput {
  eventId: EventId;
  guest: BookingEventGuest;
  timeZone: string;
  title?: string;
  description?: string;
  start?: DateTime;
  end?: DateTime;
  expectedVersion?: string | null;
}

export interface CalendarBookingPort {
  getAvailability(
    userId: string,
    input: CalendarBookingGetAvailabilityInput,
  ): Promise<BusyAvailabilityResponse>;

  createBookingEvent(
    userId: string,
    input: CalendarBookingCreateEventInput,
  ): Promise<EventId>;

  updateBookingEvent(
    userId: string,
    input: CalendarBookingUpdateEventInput,
  ): Promise<void>;

  deleteBookingEvent(
    userId: string,
    input: CalendarBookingDeleteEventInput,
  ): Promise<void>;
}
