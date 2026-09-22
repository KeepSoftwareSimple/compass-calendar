import {
  formatBookingDateKey,
  formatBookingSlotDateHeading,
  formatBookingSlotTime,
} from "@booking-web/booking/public-booking.format";
import {
  type KeyboardEvent,
  type Ref,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

interface PublicBookingSlotPickerProps {
  slots: readonly { slotStart: string }[];
  selectedDateKey: string | null;
  guestTimeZone: string;
  selectedSlotStart: string | null;
  headingRef?: Ref<HTMLHeadingElement>;
  onSelectSlot: (slotStart: string) => void;
  onEscapeToSelectedDay?: () => void;
  onJumpToNextAvailable?: () => void;
}

const SLOT_COLUMN_COUNT = 2;

function stepSlotIndex(
  index: number,
  count: number,
  key: string,
): number | null {
  if (count === 0) {
    return null;
  }
  const last = count - 1;
  switch (key) {
    case "ArrowRight":
      return Math.min(index + 1, last);
    case "ArrowLeft":
      return Math.max(index - 1, 0);
    case "ArrowDown":
      return Math.min(index + SLOT_COLUMN_COUNT, last);
    case "ArrowUp":
      return Math.max(index - SLOT_COLUMN_COUNT, 0);
    case "Home":
      return 0;
    case "End":
      return last;
    default:
      return null;
  }
}

function bookingSlotButtonId(slotStart: string): string {
  return `booking-slot-${slotStart}`;
}

export function PublicBookingSlotPicker({
  slots,
  selectedDateKey,
  guestTimeZone,
  selectedSlotStart,
  headingRef,
  onSelectSlot,
  onEscapeToSelectedDay,
  onJumpToNextAvailable,
}: PublicBookingSlotPickerProps) {
  const daySlots = useMemo(
    () =>
      selectedDateKey
        ? slots.filter(
            (slot) =>
              formatBookingDateKey(slot.slotStart, guestTimeZone) ===
              selectedDateKey,
          )
        : [],
    [guestTimeZone, selectedDateKey, slots],
  );

  const firstSlotStart = daySlots[0]?.slotStart;
  const empty = !firstSlotStart;
  const [focusedSlotStart, setFocusedSlotStart] = useState<string | null>(
    () => selectedSlotStart ?? firstSlotStart ?? null,
  );
  const moveFocusRef = useRef(false);

  useEffect(() => {
    setFocusedSlotStart((current) => {
      if (
        selectedSlotStart &&
        daySlots.some((slot) => slot.slotStart === selectedSlotStart)
      ) {
        return selectedSlotStart;
      }
      if (current && daySlots.some((slot) => slot.slotStart === current)) {
        return current;
      }
      return daySlots[0]?.slotStart ?? null;
    });
  }, [daySlots, selectedSlotStart]);

  useEffect(() => {
    if (!moveFocusRef.current || !focusedSlotStart) {
      return;
    }
    moveFocusRef.current = false;
    document.getElementById(bookingSlotButtonId(focusedSlotStart))?.focus();
  }, [focusedSlotStart]);

  const tabStopSlotStart = focusedSlotStart ?? firstSlotStart ?? null;

  const handleSlotKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onEscapeToSelectedDay?.();
      return;
    }
    const nextIndex = stepSlotIndex(index, daySlots.length, event.key);
    if (nextIndex === null) {
      return;
    }
    event.preventDefault();
    const nextStart = daySlots[nextIndex]?.slotStart;
    if (!nextStart) {
      return;
    }
    moveFocusRef.current = true;
    setFocusedSlotStart(nextStart);
  };

  return (
    <section aria-labelledby="booking-slots-heading">
      <h2
        ref={headingRef}
        id="booking-slots-heading"
        tabIndex={-1}
        className="font-medium text-base text-text focus:outline-none focus:ring-2 focus:ring-accent"
      >
        Pick a time
      </h2>
      {empty ? (
        <>
          <p className="mt-2 text-sm text-text-muted">
            {selectedDateKey
              ? "No open times on this day."
              : "No open times this month."}
          </p>
          {onJumpToNextAvailable ? (
            <button
              type="button"
              onClick={onJumpToNextAvailable}
              className="c-focus-ring mt-3 rounded-md bg-surface-panel px-3 py-2 font-medium text-sm text-text transition-colors hover:bg-surface-raised"
            >
              Jump to next available day
            </button>
          ) : (
            <p className="mt-2 text-sm text-text-muted">
              Try another month or check back later.
            </p>
          )}
        </>
      ) : (
        <>
          <h3 className="mt-1 font-medium text-sm text-text-muted">
            {formatBookingSlotDateHeading(firstSlotStart, guestTimeZone)}
          </h3>
          <ul className="mt-4 grid grid-cols-2 gap-2">
            {daySlots.map((slot, index) => {
              const isSelected = selectedSlotStart === slot.slotStart;
              const label = formatBookingSlotTime(
                slot.slotStart,
                guestTimeZone,
              );
              return (
                <li key={slot.slotStart}>
                  <button
                    type="button"
                    id={bookingSlotButtonId(slot.slotStart)}
                    data-booking-slot=""
                    aria-pressed={isSelected}
                    tabIndex={tabStopSlotStart === slot.slotStart ? 0 : -1}
                    onClick={() => onSelectSlot(slot.slotStart)}
                    onKeyDown={(event) => handleSlotKeyDown(event, index)}
                    className="c-focus-ring w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text transition-colors hover:border-accent hover:bg-surface-panel aria-pressed:border-accent aria-pressed:bg-surface-panel"
                  >
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
