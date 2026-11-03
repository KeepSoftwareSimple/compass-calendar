import { type BookingPageStatusResponse } from "@core/types/booking.contracts";
import { type Calendar } from "@core/types/calendar.contracts";
import {
  type GoogleConnectionState,
  type SyncConnectionSummary,
} from "@core/types/user.types";
import { BookingBlockerNotice } from "@web/booking/BookingBlockerNotice";
import { bookingFieldAttrs } from "@web/booking/booking-sequence.fields";
import { Switch } from "@web/components/Switch/Switch";

/** Shown once the page is on and the server says guests can book. */
export const BOOKING_LIVE_STATUS_COPY = "On. Guests can book at your link.";

/** Two lines of text-sm, so a one- or two-line status swaps without reflow. */
export const BOOKING_STATUS_SLOT_CLASS_NAME = "flex min-h-10 flex-col gap-2";

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
      {/* Reserved two-line slot: the off copy, the live line, and a blocker
          notice ("still importing", "delayed") swap in place as status loads
          or changes, so Meeting link, Duration, hours, and Save never move. */}
      <div className={BOOKING_STATUS_SLOT_CLASS_NAME}>
        {isLive ? (
          <BookingBlockerNotice
            aggregateState={aggregateState}
            calendars={calendars}
            connections={connections}
            fallback={
              status?.bookable === true ? (
                <p className="text-sm text-text-muted">
                  {BOOKING_LIVE_STATUS_COPY}
                </p>
              ) : null
            }
            hasHealthyConnection={hasHealthyConnection}
            status={status}
          />
        ) : (
          <>
            {savedUrl ? (
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
              status={undefined}
            />
          </>
        )}
      </div>
    </div>
  );
}
