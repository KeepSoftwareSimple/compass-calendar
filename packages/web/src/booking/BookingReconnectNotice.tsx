import { type SyncConnectionSummary } from "@core/types/user.types";
import { BookingReconnectButton } from "@web/booking/BookingReconnectButton";
import { reconnectActionTargets } from "@web/booking/booking-reconnect";

interface BookingReconnectNoticeProps {
  connections: readonly SyncConnectionSummary[];
  fallbackId: string;
  message: string;
  role?: "status";
}

export function BookingReconnectNotice({
  connections,
  fallbackId,
  message,
  role,
}: BookingReconnectNoticeProps) {
  return (
    <div className="flex flex-col items-start gap-2" role={role}>
      <p className="text-sm text-text">{message}</p>
      {reconnectActionTargets(connections, fallbackId).map((connection) => (
        <BookingReconnectButton connection={connection} key={connection.id} />
      ))}
    </div>
  );
}
