import { useCallback } from "react";
import { type WeeklyAvailability } from "@core/types/booking.contracts";
import { type TimeZone } from "@core/types/domain-primitives";
import { formatBookingTimezoneLabel } from "@web/booking/BookingTimezoneField";
import { BookingWeeklyHoursEditor } from "@web/booking/BookingWeeklyHoursEditor";

interface BookingSetupHoursStepProps {
  onChange: (weeklyAvailability: WeeklyAvailability) => void;
  timeZone: TimeZone;
  value: WeeklyAvailability;
}

export function BookingSetupHoursStep({
  onChange,
  timeZone,
  value,
}: BookingSetupHoursStepProps) {
  const rootRef = useCallback((node: HTMLDivElement | null) => {
    node?.querySelector<HTMLElement>("input, select, button")?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-2" ref={rootRef}>
      <BookingWeeklyHoursEditor
        describedBy="booking-setup-hours-timezone"
        onChange={onChange}
        value={value}
      />
      <p className="text-sm text-text-muted" id="booking-setup-hours-timezone">
        Times are in {formatBookingTimezoneLabel(timeZone)}. You can change this
        later.
      </p>
    </div>
  );
}
