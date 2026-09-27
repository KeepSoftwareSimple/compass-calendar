import { type BookingPageStatusResponse } from "@core/types/booking.contracts";
import { type Calendar } from "@core/types/calendar.contracts";
import {
  type GoogleConnectionState,
  type SyncConnectionSummary,
} from "@core/types/user.types";
import { BookingBlockerNotice } from "@web/booking/BookingBlockerNotice";
import { bookingFieldAttrs } from "@web/booking/booking-sequence.fields";
import { Switch } from "@web/components/Switch/Switch";

interface BookingStatusHeaderProps {
  aggregateState: GoogleConnectionState;
  hasHealthyConnection: boolean;
  isLive: boolean;
  isPending: boolean;
  onToggle: (next: boolean) => void;
  savedUrl: string | null;
  addressPreview: string | null;
  calendars: readonly Calendar[];
  connections: readonly SyncConnectionSummary[];
  status: BookingPageStatusResponse | undefined;
}

export function BookingStatusHeader({
  aggregateState,
  hasHealthyConnection,
  isLive,
  isPending,
  onToggle,
  savedUrl,
  addressPreview,
  calendars,
  connections,
  status,
}: BookingStatusHeaderProps) {
  return (
    <div className="flex flex-col gap-2">
      <Switch
        {...bookingFieldAttrs("enabled")}
        busy={isPending}
        checked={isLive}
        id="booking-meeting-page"
        label="Meeting page"
        onCheckedChange={onToggle}
      />
      {isLive ? null : savedUrl ? (
        <p className="text-sm text-text">
          Off. Guests can use this link once you turn it on.
        </p>
      ) : (
        <>
          <p className="text-sm text-text">
            Off. Turn it on to share your link.
          </p>
          {addressPreview ? (
            <p className="text-sm text-text-muted">
              It will be at {addressPreview}
            </p>
          ) : null}
        </>
      )}
      <BookingBlockerNotice
        aggregateState={aggregateState}
        calendars={calendars}
        connections={connections}
        hasHealthyConnection={hasHealthyConnection}
        status={isLive ? status : undefined}
      />
    </div>
  );
}
