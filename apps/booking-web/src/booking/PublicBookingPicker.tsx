import {
  bookingDayButtonId,
  PublicBookingMonthGrid,
} from "@booking-web/booking/PublicBookingMonthGrid";
import { PublicBookingMonthGridSkeleton } from "@booking-web/booking/PublicBookingMonthGridSkeleton";
import { PublicBookingSlotPaneSkeleton } from "@booking-web/booking/PublicBookingSlotPaneSkeleton";
import { PublicBookingSlotPicker } from "@booking-web/booking/PublicBookingSlotPicker";
import { formatBookingMonthHeading } from "@booking-web/booking/public-booking.format";
import { type Ref, useEffect, useRef, useState } from "react";

interface PublicBookingPickerProps {
  monthKey: string;
  timeZone: string;
  maxHorizonDays: number;
  slots: readonly { slotStart: string }[];
  slotsPending: boolean;
  slotsError: boolean;
  slotsFetching: boolean;
  selectedDateKey: string | null;
  selectedSlotStart: string | null;
  slotsHeadingRef?: Ref<HTMLHeadingElement>;
  onMonthChange: (monthKey: string) => void;
  onPrefetchMonth: (monthKey: string) => void;
  onSelectDate: (dateKey: string) => void;
  onSelectSlot: (slotStart: string) => void;
  onJumpToNextAvailable: () => void;
  onRetrySlots: () => void;
}

function useSlotsLiveMessage(pending: boolean, error: boolean): string {
  const [message, setMessage] = useState("");
  const wasPending = useRef(false);

  useEffect(() => {
    if (pending) {
      wasPending.current = true;
      setMessage("Loading open times");
      return;
    }
    if (error) {
      wasPending.current = false;
      setMessage("Could not load times");
      return;
    }
    if (wasPending.current) {
      wasPending.current = false;
      setMessage("Times loaded");
    }
  }, [error, pending]);

  return message;
}

export function PublicBookingPicker({
  monthKey,
  timeZone,
  maxHorizonDays,
  slots,
  slotsPending,
  slotsError,
  slotsFetching,
  selectedDateKey,
  selectedSlotStart,
  slotsHeadingRef,
  onMonthChange,
  onPrefetchMonth,
  onSelectDate,
  onSelectSlot,
  onJumpToNextAvailable,
  onRetrySlots,
}: PublicBookingPickerProps) {
  const [hasRenderedGrid, setHasRenderedGrid] = useState(false);
  const liveMessage = useSlotsLiveMessage(
    slotsFetching,
    slotsError && !slotsFetching,
  );
  const showGridSkeleton = slotsPending && !hasRenderedGrid;
  const restoreFocusAfterError = useRef(false);
  const pendingSlotFocusDateRef = useRef<string | null>(null);
  const slotPaneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!slotsPending) {
      setHasRenderedGrid(true);
    }
  }, [slotsPending]);

  useEffect(() => {
    if (slotsError) {
      restoreFocusAfterError.current = true;
    }
  }, [slotsError]);

  useEffect(() => {
    if (slotsPending || slotsError || !restoreFocusAfterError.current) {
      return;
    }
    restoreFocusAfterError.current = false;
    if (typeof slotsHeadingRef === "object" && slotsHeadingRef) {
      slotsHeadingRef.current?.focus();
    }
  }, [slotsError, slotsHeadingRef, slotsPending]);

  const focusFirstSlot = () => {
    slotPaneRef.current
      ?.querySelector<HTMLButtonElement>("[data-booking-slot]")
      ?.focus();
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: focusFirstSlot only reads refs; the selected date changing is the trigger
  useEffect(() => {
    const pendingDate = pendingSlotFocusDateRef.current;
    if (pendingDate === null || pendingDate !== selectedDateKey) {
      return;
    }
    pendingSlotFocusDateRef.current = null;
    focusFirstSlot();
  }, [selectedDateKey]);

  const handleKeyboardActivateDay = (dateKey: string) => {
    if (dateKey === selectedDateKey) {
      focusFirstSlot();
      return;
    }
    pendingSlotFocusDateRef.current = dateKey;
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-3 sm:min-h-80 sm:flex-1">
      <p aria-live="polite" className="sr-only" role="status">
        {liveMessage}
      </p>
      <div className="grid w-full min-w-0 gap-6 sm:min-h-80 sm:flex-1 sm:grid-cols-2">
        <div className="min-w-0">
          {showGridSkeleton ? (
            <PublicBookingMonthGridSkeleton
              monthHeading={formatBookingMonthHeading(monthKey, timeZone)}
            />
          ) : (
            <PublicBookingMonthGrid
              monthKey={monthKey}
              timeZone={timeZone}
              maxHorizonDays={maxHorizonDays}
              slots={slots}
              selectedDateKey={selectedDateKey}
              onMonthChange={onMonthChange}
              onPrefetchMonth={onPrefetchMonth}
              onSelectDate={onSelectDate}
              onKeyboardActivateDay={handleKeyboardActivateDay}
            />
          )}
        </div>
        <div
          ref={slotPaneRef}
          className="min-h-64 min-w-0 sm:min-h-0 sm:overflow-y-auto"
        >
          {slotsPending ? (
            <PublicBookingSlotPaneSkeleton />
          ) : slotsError ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-text-muted">Could not load times.</p>
              <button
                type="button"
                disabled={slotsFetching}
                aria-busy={slotsFetching || undefined}
                onClick={onRetrySlots}
                className="c-button c-button-secondary"
              >
                Retry
              </button>
            </div>
          ) : (
            <PublicBookingSlotPicker
              slots={slots}
              selectedDateKey={selectedDateKey}
              guestTimeZone={timeZone}
              selectedSlotStart={selectedSlotStart}
              headingRef={slotsHeadingRef}
              onSelectSlot={onSelectSlot}
              onEscapeToSelectedDay={() => {
                if (!selectedDateKey) {
                  return;
                }
                document
                  .getElementById(bookingDayButtonId(monthKey, selectedDateKey))
                  ?.focus();
              }}
              onJumpToNextAvailable={onJumpToNextAvailable}
            />
          )}
        </div>
      </div>
    </div>
  );
}
