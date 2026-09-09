import {
  type GoogleConnectionState,
  type SyncConnectionSummary,
} from "@core/types/user.types";
import { ConnectProviderChooser } from "@web/auth/providers/ConnectProviderChooser";
import {
  connectionProvider,
  RECONNECT_BANNER_MESSAGE,
} from "@web/auth/providers/provider-copy.util";
import { BookingReconnectButton } from "@web/booking/BookingReconnectButton";

const FALLBACK_RECONNECT_CONNECTION: SyncConnectionSummary = {
  id: "booking-reconnect-fallback",
  provider: "google",
  state: "actionRequired",
  stateReason: null,
  lastSyncedAt: null,
  lastHealthyAt: null,
  accountEmail: null,
  connectionState: "RECONNECT_REQUIRED",
  canSuggestContacts: false,
};

interface BookingConnectionBannerProps {
  aggregateState: GoogleConnectionState;
  connections: readonly SyncConnectionSummary[];
}

export function BookingConnectionBanner({
  aggregateState,
  connections,
}: BookingConnectionBannerProps) {
  const reconnecting = connections.filter(
    (connection) => connection.connectionState === "RECONNECT_REQUIRED",
  );
  const importing = connections.some(
    (connection) => connection.connectionState === "IMPORTING",
  );
  const showReconnect =
    reconnecting.length > 0 ||
    (connections.length === 0 && aggregateState === "RECONNECT_REQUIRED");
  const showImporting =
    !showReconnect && (importing || aggregateState === "IMPORTING");

  if (showReconnect) {
    const targets =
      reconnecting.length > 0 ? reconnecting : [FALLBACK_RECONNECT_CONNECTION];
    const kind = connectionProvider(targets[0]);
    return (
      <div className="flex flex-col items-start gap-2" role="status">
        <p className="text-sm text-text">
          Guests can't book right now. {RECONNECT_BANNER_MESSAGE[kind]}
        </p>
        {targets.map((connection) => (
          <BookingReconnectButton connection={connection} key={connection.id} />
        ))}
      </div>
    );
  }

  if (showImporting) {
    return (
      <div className="flex flex-col items-start gap-2" role="status">
        <p className="text-sm text-text">
          Your calendar is still importing. Guests can book once it finishes.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2" role="status">
      <p className="text-sm text-text">
        Guests can't book right now. Connect a calendar to turn your page back
        on.
      </p>
      <ConnectProviderChooser variant="prompt" />
    </div>
  );
}
