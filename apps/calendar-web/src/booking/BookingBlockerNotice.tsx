import { type BookingPageStatusResponse } from "@core/types/booking.contracts";
import { type Calendar } from "@core/types/calendar.contracts";
import {
  type GoogleConnectionState,
  type SyncConnectionSummary,
} from "@core/types/user.types";
import { ConnectProviderChooser } from "@web/auth/providers/ConnectProviderChooser";
import { BookingReconnectButton } from "@web/booking/BookingReconnectButton";
import { selectBookingBlocker } from "@web/booking/booking-blocker";
import { reconnectActionTargets } from "@web/booking/booking-reconnect";

const FALLBACK_RECONNECT_ID = "booking-reconnect-fallback";

interface BookingBlockerNoticeProps {
  aggregateState: GoogleConnectionState;
  calendars: readonly Calendar[];
  connections: readonly SyncConnectionSummary[];
  hasHealthyConnection: boolean;
  status: BookingPageStatusResponse | undefined;
}

/** The one place a host is told why guests can't book, and what to do about it. */
export function BookingBlockerNotice({
  aggregateState,
  calendars,
  connections,
  hasHealthyConnection,
  status,
}: BookingBlockerNoticeProps) {
  const blocker = selectBookingBlocker({
    aggregateState,
    calendars,
    connections,
    hasHealthyConnection,
    status,
  });
  if (!blocker) return null;

  return (
    <div className="flex flex-col items-start gap-2" role="status">
      <p className="text-sm text-text">{blocker.message}</p>
      {blocker.action === "reconnect"
        ? reconnectActionTargets(connections, FALLBACK_RECONNECT_ID).map(
            (connection) => (
              <BookingReconnectButton
                connection={connection}
                key={connection.id}
              />
            ),
          )
        : null}
      {blocker.action === "connect" ? (
        <ConnectProviderChooser variant="prompt" />
      ) : null}
    </div>
  );
}
