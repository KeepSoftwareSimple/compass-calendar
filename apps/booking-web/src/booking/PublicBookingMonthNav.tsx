import {
  formatBookingMonthHeading,
  isBookingMonthAvailable,
  shiftBookingMonthKey,
} from "@booking-web/booking/public-booking.format";

interface PublicBookingMonthNavProps {
  monthKey: string;
  timeZone: string;
  maxHorizonDays: number;
  onMonthChange: (monthKey: string) => void;
  onPrefetchMonth: (monthKey: string) => void;
}

export function PublicBookingMonthNav({
  monthKey,
  timeZone,
  maxHorizonDays,
  onMonthChange,
  onPrefetchMonth,
}: PublicBookingMonthNavProps) {
  const previousMonthKey = shiftBookingMonthKey(monthKey, -1, timeZone);
  const nextMonthKey = shiftBookingMonthKey(monthKey, 1, timeZone);
  const canGoPrevious = isBookingMonthAvailable(
    previousMonthKey,
    timeZone,
    maxHorizonDays,
  );
  const canGoNext = isBookingMonthAvailable(
    nextMonthKey,
    timeZone,
    maxHorizonDays,
  );
  const prefetchIfEnabled = (enabled: boolean, target: string) => {
    if (enabled) {
      onPrefetchMonth(target);
    }
  };

  return (
    <nav
      aria-labelledby="booking-month-heading"
      className="flex items-center justify-between gap-2"
    >
      <button
        type="button"
        aria-label="Previous month"
        disabled={!canGoPrevious}
        onClick={() => onMonthChange(previousMonthKey)}
        onMouseEnter={() => prefetchIfEnabled(canGoPrevious, previousMonthKey)}
        onFocus={() => prefetchIfEnabled(canGoPrevious, previousMonthKey)}
        className="c-focus-ring rounded-md px-3 py-2 font-medium text-sm text-text transition-colors hover:bg-surface-panel disabled:cursor-not-allowed disabled:opacity-40"
      >
        Previous
      </button>
      <h2
        id="booking-month-heading"
        className="font-medium text-base text-text"
      >
        {formatBookingMonthHeading(monthKey, timeZone)}
      </h2>
      <button
        type="button"
        aria-label="Next month"
        disabled={!canGoNext}
        onClick={() => onMonthChange(nextMonthKey)}
        onMouseEnter={() => prefetchIfEnabled(canGoNext, nextMonthKey)}
        onFocus={() => prefetchIfEnabled(canGoNext, nextMonthKey)}
        className="c-focus-ring rounded-md px-3 py-2 font-medium text-sm text-text transition-colors hover:bg-surface-panel disabled:cursor-not-allowed disabled:opacity-40"
      >
        Next
      </button>
    </nav>
  );
}
