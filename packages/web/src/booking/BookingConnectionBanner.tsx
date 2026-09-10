import {
  type GoogleConnectionState,
  type SyncConnectionSummary,
} from "@core/types/user.types";
import { ConnectProviderChooser } from "@web/auth/providers/ConnectProviderChooser";
import {
  connectionProvider,
  RECONNECT_BANNER_MESSAGE,
} from "@web/auth/providers/provider-copy.util";
import { BookingReconnectNotice } from "@web/booking/BookingReconnectNotice";
import {
  BOOKING_CONNECT_TO_RESUME_COPY,
  BOOKING_IMPORTING_STATUS_COPY,
  BOOKING_NOT_BOOKABLE_PREFIX,
} from "@web/booking/booking-bookability.copy";
import {
  reconnectActionTargets,
  reconnectRequiredConnections,
} from "@web/booking/booking-reconnect";

const FALLBACK_RECONNECT_ID = "booking-reconnect-fallback";

interface BookingConnectionBannerProps {
  aggregateState: GoogleConnectionState;
  connections: readonly SyncConnectionSummary[];
}

export function BookingConnectionBanner({
  aggregateState,
  connections,
}: BookingConnectionBannerProps) {
  const reconnecting = reconnectRequiredConnections(connections);
  const importing = connections.some(
    (connection) => connection.connectionState === "IMPORTING",
  );
  const showReconnect =
    reconnecting.length > 0 ||
    (connections.length === 0 && aggregateState === "RECONNECT_REQUIRED");
  const showImporting =
    !showReconnect && (importing || aggregateState === "IMPORTING");

  if (showReconnect) {
    const kind = connectionProvider(
      reconnectActionTargets(connections, FALLBACK_RECONNECT_ID)[0],
    );
    return (
      <BookingReconnectNotice
        connections={connections}
        fallbackId={FALLBACK_RECONNECT_ID}
        message={`${BOOKING_NOT_BOOKABLE_PREFIX}. ${RECONNECT_BANNER_MESSAGE[kind]}`}
        role="status"
      />
    );
  }

  if (showImporting) {
    return (
      <div className="flex flex-col items-start gap-2" role="status">
        <p className="text-sm text-text">{BOOKING_IMPORTING_STATUS_COPY}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2" role="status">
      <p className="text-sm text-text">
        {BOOKING_NOT_BOOKABLE_PREFIX}. {BOOKING_CONNECT_TO_RESUME_COPY}
      </p>
      <ConnectProviderChooser variant="prompt" />
    </div>
  );
}
