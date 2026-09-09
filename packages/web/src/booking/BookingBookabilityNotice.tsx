import { type BookingPageStatusResponse } from "@core/types/booking.contracts";
import { type Calendar } from "@core/types/calendar.contracts";
import { type SyncConnectionSummary } from "@core/types/user.types";
import {
  connectionProvider,
  RECONNECT_BANNER_MESSAGE,
} from "@web/auth/providers/provider-copy.util";
import { BookingReconnectButton } from "@web/booking/BookingReconnectButton";
import {
  BOOKING_BILLING_STATUS_COPY,
  BOOKING_NOT_BOOKABLE_PREFIX,
  bookingCalendarName,
  bookingCalendarUnbookableCopy,
  bookingConnectionUnbookableCopy,
  isReconnectConnectionState,
} from "@web/booking/booking-bookability.copy";

const FALLBACK_RECONNECT_CONNECTION: SyncConnectionSummary = {
  id: "booking-status-reconnect-fallback",
  provider: "google",
  state: "actionRequired",
  stateReason: null,
  lastSyncedAt: null,
  lastHealthyAt: null,
  accountEmail: null,
  connectionState: "RECONNECT_REQUIRED",
  canSuggestContacts: false,
};

interface BookingBookabilityNoticeProps {
  calendars: readonly Calendar[];
  connections: readonly SyncConnectionSummary[];
  status: BookingPageStatusResponse;
}

export function BookingBookabilityNotice({
  calendars,
  connections,
  status,
}: BookingBookabilityNoticeProps) {
  if (status.bookable) return null;

  const reconnecting = connections.filter(
    (connection) => connection.connectionState === "RECONNECT_REQUIRED",
  );

  return (
    <div className="flex flex-col items-start gap-2" role="status">
      {status.reasons.length === 0 ? (
        <p className="text-sm text-text">{BOOKING_NOT_BOOKABLE_PREFIX}.</p>
      ) : null}
      {status.reasons.map((reason) => {
        const reasonKey = [
          reason.kind,
          reason.reason,
          reason.calendarId ?? reason.connectionState ?? "",
        ].join("-");
        if (reason.kind === "billing") {
          return (
            <p className="text-sm text-text" key={reasonKey}>
              {BOOKING_NOT_BOOKABLE_PREFIX}: {BOOKING_BILLING_STATUS_COPY}
            </p>
          );
        }
        if (reason.kind === "calendar") {
          const copy = bookingCalendarUnbookableCopy(
            bookingCalendarName(calendars, reason.calendarId),
            reason.reason,
          );
          return (
            <p className="text-sm text-text" key={reasonKey}>
              {BOOKING_NOT_BOOKABLE_PREFIX}: {copy}
            </p>
          );
        }
        const state = reason.connectionState;
        if (state && isReconnectConnectionState(state)) {
          const kind = connectionProvider(reconnecting[0]);
          const targets =
            reconnecting.length > 0
              ? reconnecting
              : [FALLBACK_RECONNECT_CONNECTION];
          return (
            <div className="flex flex-col items-start gap-2" key={reasonKey}>
              <p className="text-sm text-text">
                {BOOKING_NOT_BOOKABLE_PREFIX}: {RECONNECT_BANNER_MESSAGE[kind]}
              </p>
              {targets.map((connection) => (
                <BookingReconnectButton
                  connection={connection}
                  key={connection.id}
                />
              ))}
            </div>
          );
        }
        const copy = state ? bookingConnectionUnbookableCopy(state) : null;
        return (
          <p className="text-sm text-text" key={reasonKey}>
            {BOOKING_NOT_BOOKABLE_PREFIX}
            {copy ? `: ${copy}` : "."}
          </p>
        );
      })}
    </div>
  );
}
