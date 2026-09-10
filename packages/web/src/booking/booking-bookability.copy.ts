import { type Calendar } from "@core/types/calendar.contracts";
import { type CalendarId } from "@core/types/domain-primitives";
import { type ConnectionState } from "@core/types/sync/connection.contracts";

export const BOOKING_NOT_BOOKABLE_PREFIX = "Guests can't book right now";
export const BOOKING_NAV_NEEDS_ATTENTION = "needs attention";
export const BOOKING_BLOCKING_CALENDAR_FALLBACK = "A blocking calendar";
export const BOOKING_BILLING_STATUS_COPY =
  "A paid subscription is required to make changes";
export const BOOKING_IMPORTING_STATUS_COPY =
  "Your calendar is still importing. Guests can book once it finishes.";
export const BOOKING_DELAYED_STATUS_COPY =
  "Your calendar sync is delayed. Compass is retrying.";
export const BOOKING_CONNECT_TO_RESUME_COPY =
  "Connect a calendar to turn your page back on.";

const reconnectStates = new Set<ConnectionState>([
  "actionRequired",
  "disconnected",
]);

export function isReconnectConnectionState(state: ConnectionState): boolean {
  return reconnectStates.has(state);
}

export function bookingCalendarName(
  calendars: readonly Calendar[],
  calendarId: CalendarId | undefined,
): string {
  if (!calendarId) return BOOKING_BLOCKING_CALENDAR_FALLBACK;
  return (
    calendars.find((calendar) => calendar.id === calendarId)?.name ??
    BOOKING_BLOCKING_CALENDAR_FALLBACK
  );
}

export function bookingCalendarUnbookableCopy(
  calendarName: string,
  reason: string,
): string {
  if (reason === "notImported") {
    return `${calendarName} is no longer synced. Remove it from Blocking calendars or reconnect the account.`;
  }
  return `${calendarName} hasn't synced recently. Guests can book once it catches up.`;
}

export function bookingConnectionUnbookableCopy(
  state: ConnectionState,
): string | null {
  if (state === "importing" || state === "connecting") {
    return BOOKING_IMPORTING_STATUS_COPY;
  }
  if (state === "delayed" || state === "catchingUp") {
    return BOOKING_DELAYED_STATUS_COPY;
  }
  return null;
}
