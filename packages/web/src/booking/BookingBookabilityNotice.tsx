import { type BookingPageStatusResponse } from "@core/types/booking.contracts";
import { type Calendar } from "@core/types/calendar.contracts";
import { type SyncConnectionSummary } from "@core/types/user.types";
import {
  connectionProvider,
  RECONNECT_BANNER_MESSAGE,
} from "@web/auth/providers/provider-copy.util";
import { BookingReconnectNotice } from "@web/booking/BookingReconnectNotice";
import {
  BOOKING_BILLING_STATUS_COPY,
  BOOKING_NOT_BOOKABLE_PREFIX,
  bookingCalendarName,
  bookingCalendarUnbookableCopy,
  bookingConnectionUnbookableCopy,
  isReconnectConnectionState,
} from "@web/booking/booking-bookability.copy";
import { reconnectRequiredConnections } from "@web/booking/booking-reconnect";

const FALLBACK_RECONNECT_ID = "booking-status-reconnect-fallback";

interface BookingBookabilityNoticeProps {
  calendars: readonly Calendar[];
  connections: readonly SyncConnectionSummary[];
  status: BookingPageStatusResponse;
}

const bookabilityLine = (key: string, copy?: string | null) => (
  <p className="text-sm text-text" key={key}>
    {copy
      ? `${BOOKING_NOT_BOOKABLE_PREFIX}: ${copy}`
      : `${BOOKING_NOT_BOOKABLE_PREFIX}.`}
  </p>
);

export function BookingBookabilityNotice({
  calendars,
  connections,
  status,
}: BookingBookabilityNoticeProps) {
  if (status.bookable) return null;

  const reconnecting = reconnectRequiredConnections(connections);

  return (
    <div className="flex flex-col items-start gap-2" role="status">
      {status.reasons.length === 0
        ? bookabilityLine("empty")
        : status.reasons.map((reason) => {
            const reasonKey = [
              reason.kind,
              reason.reason,
              reason.calendarId ?? reason.connectionState ?? "",
            ].join("-");
            if (reason.kind === "billing") {
              return bookabilityLine(reasonKey, BOOKING_BILLING_STATUS_COPY);
            }
            if (reason.kind === "calendar") {
              return bookabilityLine(
                reasonKey,
                bookingCalendarUnbookableCopy(
                  bookingCalendarName(calendars, reason.calendarId),
                  reason.reason,
                ),
              );
            }
            const state = reason.connectionState;
            if (state && isReconnectConnectionState(state)) {
              const kind = connectionProvider(reconnecting[0]);
              return (
                <BookingReconnectNotice
                  connections={connections}
                  fallbackId={FALLBACK_RECONNECT_ID}
                  key={reasonKey}
                  message={`${BOOKING_NOT_BOOKABLE_PREFIX}: ${RECONNECT_BANNER_MESSAGE[kind]}`}
                />
              );
            }
            return bookabilityLine(
              reasonKey,
              state ? bookingConnectionUnbookableCopy(state) : null,
            );
          })}
    </div>
  );
}
