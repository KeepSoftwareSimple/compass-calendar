import {
  formatBookingSlotLabel,
  formatDurationMinutes,
  formatGuestTimeZoneLabel,
} from "@booking-web/booking/public-booking.format";

interface PublicBookingSlotSummaryProps {
  slotStart: string;
  durationMinutes: number;
  timeZone: string;
}

export function PublicBookingSlotSummary({
  slotStart,
  durationMinutes,
  timeZone,
}: PublicBookingSlotSummaryProps) {
  return (
    <dl className="rounded-md border border-border bg-surface-panel px-3 py-2 text-sm text-text">
      <div>
        <dt className="text-text-muted">When</dt>
        <dd>{formatBookingSlotLabel(slotStart, timeZone)}</dd>
      </div>
      <div className="mt-2">
        <dt className="text-text-muted">Duration</dt>
        <dd>{formatDurationMinutes(durationMinutes)}</dd>
      </div>
      <div className="mt-2">
        <dt className="text-text-muted">Timezone</dt>
        <dd>{formatGuestTimeZoneLabel(timeZone)}</dd>
      </div>
    </dl>
  );
}
