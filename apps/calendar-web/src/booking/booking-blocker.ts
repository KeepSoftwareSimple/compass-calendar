import {
  type BookingPageStatusReason,
  type BookingPageStatusResponse,
} from "@core/types/booking.contracts";
import { type Calendar } from "@core/types/calendar.contracts";
import {
  type GoogleConnectionState,
  type SyncConnectionSummary,
} from "@core/types/user.types";
import {
  connectionProvider,
  RECONNECT_BANNER_MESSAGE,
} from "@web/auth/providers/provider-copy.util";
import {
  BOOKING_BILLING_STATUS_COPY,
  BOOKING_CONNECT_TO_RESUME_COPY,
  BOOKING_IMPORTING_STATUS_COPY,
  BOOKING_NOT_BOOKABLE_PREFIX,
  bookingCalendarName,
  bookingCalendarUnbookableCopy,
  bookingConnectionUnbookableCopy,
  isReconnectConnectionState,
} from "@web/booking/booking-bookability.copy";
import { reconnectRequiredConnections } from "@web/booking/booking-reconnect";

/**
 * A blocked meeting page shows one message and at most one action. `reconnect`
 * and `connect` carry a button; `info` is something the host waits out.
 */
export type BookingBlockerAction = "reconnect" | "connect" | "info";

export interface BookingBlocker {
  action: BookingBlockerAction;
  message: string;
}

interface BookingBlockerInput {
  aggregateState: GoogleConnectionState;
  calendars: readonly Calendar[];
  connections: readonly SyncConnectionSummary[];
  hasHealthyConnection: boolean;
  status: BookingPageStatusResponse | undefined;
}

/** Lower rank wins. Blockers the host can act on come before ones they wait out. */
function reasonRank(reason: BookingPageStatusReason): number {
  if (reason.kind === "connection") {
    const state = reason.connectionState;
    return state && isReconnectConnectionState(state) ? 0 : 3;
  }
  if (reason.kind === "billing") return 1;
  return reason.reason === "stale" ? 4 : 2;
}

function topReason(
  reasons: readonly BookingPageStatusReason[],
): BookingPageStatusReason | undefined {
  return [...reasons].sort((a, b) => reasonRank(a) - reasonRank(b))[0];
}

function line(copy: string): string {
  return `${BOOKING_NOT_BOOKABLE_PREFIX}: ${copy}`;
}

function reconnectBlocker(
  connection: SyncConnectionSummary | undefined,
): BookingBlocker {
  return {
    action: "reconnect",
    message: line(RECONNECT_BANNER_MESSAGE[connectionProvider(connection)]),
  };
}

function reasonBlocker(
  reason: BookingPageStatusReason,
  calendars: readonly Calendar[],
  connections: readonly SyncConnectionSummary[],
): BookingBlocker {
  if (reason.kind === "billing") {
    return { action: "info", message: line(BOOKING_BILLING_STATUS_COPY) };
  }
  if (reason.kind === "calendar") {
    return {
      action: "info",
      message: line(
        bookingCalendarUnbookableCopy(
          bookingCalendarName(calendars, reason.calendarId),
          reason.reason,
        ),
      ),
    };
  }
  const state = reason.connectionState;
  if (state && isReconnectConnectionState(state)) {
    return reconnectBlocker(reconnectRequiredConnections(connections)[0]);
  }
  const copy = state ? bookingConnectionUnbookableCopy(state) : null;
  return {
    action: "info",
    message: copy ? line(copy) : `${BOOKING_NOT_BOOKABLE_PREFIX}.`,
  };
}

/**
 * The single blocker to show a host, or null when guests can book. An unhealthy
 * account is answered first so it is named once, with one action, instead of
 * once by the connection banner and again by page status.
 */
export function selectBookingBlocker({
  aggregateState,
  calendars,
  connections,
  hasHealthyConnection,
  status,
}: BookingBlockerInput): BookingBlocker | null {
  if (!hasHealthyConnection) {
    const reconnecting = reconnectRequiredConnections(connections);
    if (reconnecting.length > 0) return reconnectBlocker(reconnecting[0]);
    if (connections.length === 0 && aggregateState === "RECONNECT_REQUIRED") {
      return reconnectBlocker(undefined);
    }
    if (
      aggregateState === "IMPORTING" ||
      connections.some(
        (connection) => connection.connectionState === "IMPORTING",
      )
    ) {
      return { action: "info", message: line(BOOKING_IMPORTING_STATUS_COPY) };
    }
    return { action: "connect", message: line(BOOKING_CONNECT_TO_RESUME_COPY) };
  }

  if (!status || status.bookable) return null;

  const reason = topReason(status.reasons);
  return reason
    ? reasonBlocker(reason, calendars, connections)
    : { action: "info", message: `${BOOKING_NOT_BOOKABLE_PREFIX}.` };
}
