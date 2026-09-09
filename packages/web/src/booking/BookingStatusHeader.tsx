import { type BookingPageStatusResponse } from "@core/types/booking.contracts";
import { type Calendar } from "@core/types/calendar.contracts";
import { type SyncConnectionSummary } from "@core/types/user.types";
import { BookingBookabilityNotice } from "@web/booking/BookingBookabilityNotice";
import { BookingCopyLink } from "@web/booking/BookingCopyLink";
import { bookingFieldAttrs } from "@web/booking/booking-sequence.fields";
import { Switch } from "@web/components/Switch/Switch";

interface BookingStatusHeaderProps {
  isLive: boolean;
  isPending: boolean;
  onToggle: (next: boolean) => void;
  bookingUrl: string | null;
  addressPreview: string | null;
  calendars: readonly Calendar[];
  connections: readonly SyncConnectionSummary[];
  status: BookingPageStatusResponse | undefined;
}

export function BookingStatusHeader({
  isLive,
  isPending,
  onToggle,
  bookingUrl,
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
      {isLive ? (
        bookingUrl ? (
          <BookingCopyLink bookingUrl={bookingUrl} />
        ) : null
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
      {isLive && status ? (
        <BookingBookabilityNotice
          calendars={calendars}
          connections={connections}
          status={status}
        />
      ) : null}
    </div>
  );
}
