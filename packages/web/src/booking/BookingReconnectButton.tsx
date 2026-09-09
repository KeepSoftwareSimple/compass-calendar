import { type SyncConnectionSummary } from "@core/types/user.types";
import {
  connectionProvider,
  RECONNECT_CALENDAR_LABEL,
} from "@web/auth/providers/provider-copy.util";
import { useConnectProvider } from "@web/auth/providers/useConnectProvider";

interface BookingReconnectButtonProps {
  connection: SyncConnectionSummary;
}

export function BookingReconnectButton({
  connection,
}: BookingReconnectButtonProps) {
  const kind = connectionProvider(connection);
  const { connect, isConnecting } = useConnectProvider(kind, { connection });

  return (
    <button
      className="c-button c-button-secondary"
      disabled={isConnecting}
      onClick={() => connect()}
      type="button"
    >
      {RECONNECT_CALENDAR_LABEL[kind]}
    </button>
  );
}
