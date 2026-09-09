import {
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dayjs from "@core/util/date/dayjs";
import { PublicBookingMonthNav } from "@web/booking/PublicBookingMonthNav";
import {
  type BookingMonthGridCell,
  collectBookingAvailableDateKeys,
  formatBookingDateKey,
  formatBookingMonthDayLabel,
  listBookingAvailableDayKeys,
  listBookingMonthGridWeeks,
  listBookingWeekdayHeadings,
  stepBookingAvailableDay,
} from "@web/booking/public-booking.format";

interface PublicBookingMonthGridProps {
  monthKey: string;
  timeZone: string;
  maxHorizonDays: number;
  slots: readonly { slotStart: string }[];
  selectedDateKey: string | null;
  todayKey?: string;
  onMonthChange: (monthKey: string) => void;
  onPrefetchMonth: (monthKey: string) => void;
  onSelectDate: (dateKey: string) => void;
  onKeyboardActivateDay?: (dateKey: string) => void;
}

export function PublicBookingMonthGrid({
  monthKey,
  timeZone,
  maxHorizonDays,
  slots,
  selectedDateKey,
  todayKey,
  onMonthChange,
  onPrefetchMonth,
  onSelectDate,
  onKeyboardActivateDay,
}: PublicBookingMonthGridProps) {
  const resolvedTodayKey = todayKey ?? formatBookingDateKey(dayjs(), timeZone);
  const availableDateKeys = useMemo(
    () => collectBookingAvailableDateKeys(slots, timeZone),
    [slots, timeZone],
  );
  const weeks = useMemo(
    () =>
      listBookingMonthGridWeeks(
        monthKey,
        timeZone,
        availableDateKeys,
        resolvedTodayKey,
      ),
    [availableDateKeys, monthKey, resolvedTodayKey, timeZone],
  );
  const availableDays = useMemo(
    () => listBookingAvailableDayKeys(weeks),
    [weeks],
  );
  const weekdayHeadings = useMemo(
    () => listBookingWeekdayHeadings(timeZone),
    [timeZone],
  );

  const [focusedDateKey, setFocusedDateKey] = useState<string | null>(
    () => selectedDateKey ?? availableDays[0] ?? null,
  );
  const moveFocusRef = useRef(false);

  useEffect(() => {
    setFocusedDateKey((current) => {
      if (selectedDateKey && availableDays.includes(selectedDateKey)) {
        return selectedDateKey;
      }
      if (current && availableDays.includes(current)) {
        return current;
      }
      return availableDays[0] ?? null;
    });
  }, [availableDays, selectedDateKey]);

  useEffect(() => {
    if (!moveFocusRef.current || !focusedDateKey) {
      return;
    }
    moveFocusRef.current = false;
    const button = document.getElementById(
      bookingDayButtonId(monthKey, focusedDateKey),
    );
    button?.focus();
  }, [focusedDateKey, monthKey]);

  const tabStopDateKey = focusedDateKey ?? availableDays[0] ?? null;

  const handleDayKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    dateKey: string,
  ) => {
    if (availableDays.length === 0) {
      return;
    }
    let next = dateKey;
    if (event.key === "ArrowLeft") {
      next = stepBookingAvailableDay(
        dateKey,
        availableDays,
        timeZone,
        "previous",
      );
    } else if (event.key === "ArrowRight") {
      next = stepBookingAvailableDay(dateKey, availableDays, timeZone, "next");
    } else if (event.key === "ArrowUp") {
      next = stepBookingAvailableDay(
        dateKey,
        availableDays,
        timeZone,
        "previousWeek",
      );
    } else if (event.key === "ArrowDown") {
      next = stepBookingAvailableDay(
        dateKey,
        availableDays,
        timeZone,
        "nextWeek",
      );
    } else if (event.key === "Home") {
      next = availableDays[0] ?? dateKey;
    } else if (event.key === "End") {
      next = availableDays[availableDays.length - 1] ?? dateKey;
    } else {
      return;
    }
    event.preventDefault();
    moveFocusRef.current = true;
    setFocusedDateKey(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <PublicBookingMonthNav
        monthKey={monthKey}
        timeZone={timeZone}
        maxHorizonDays={maxHorizonDays}
        onMonthChange={onMonthChange}
        onPrefetchMonth={onPrefetchMonth}
      />
      <div className="w-full">
        <div className="grid grid-cols-7">
          {weekdayHeadings.map((weekday) => (
            <div
              key={weekday.long}
              className="pb-1 text-center font-medium text-text-muted text-xs"
            >
              <span aria-hidden="true">{weekday.short}</span>
              <span className="sr-only">{weekday.long}</span>
            </div>
          ))}
        </div>
        {weeks.map((week) => {
          const rowKey = weekRowKey(week, monthKey);
          return (
            <div key={rowKey} className="grid grid-cols-7">
              {week.map((cell, cellIndex) => {
                if (cell.kind === "pad") {
                  return (
                    <div
                      // biome-ignore lint/suspicious/noArrayIndexKey: leading and trailing pads have no date identity
                      key={`${rowKey}-pad-${cellIndex}`}
                      className="p-0.5"
                      aria-hidden="true"
                    />
                  );
                }
                const { day } = cell;
                const isSelected = selectedDateKey === day.dateKey;
                if (!day.available) {
                  return (
                    <div
                      key={day.dateKey}
                      aria-current={day.isToday ? "date" : undefined}
                      aria-disabled="true"
                      className="flex h-10 w-full items-center justify-center rounded-md text-sm text-text-muted"
                    >
                      {day.dayOfMonth}
                      <span className="sr-only"> no times available</span>
                    </div>
                  );
                }
                return (
                  <button
                    key={day.dateKey}
                    type="button"
                    id={bookingDayButtonId(monthKey, day.dateKey)}
                    aria-label={formatBookingMonthDayLabel(
                      day.dateKey,
                      timeZone,
                    )}
                    aria-pressed={isSelected}
                    aria-current={day.isToday ? "date" : undefined}
                    tabIndex={tabStopDateKey === day.dateKey ? 0 : -1}
                    onClick={(event) => {
                      setFocusedDateKey(day.dateKey);
                      onSelectDate(day.dateKey);
                      // Keyboard activation (Enter/Space) reports detail 0.
                      // Pointer clicks must not steal focus to the slot list.
                      if (event.detail === 0) {
                        onKeyboardActivateDay?.(day.dateKey);
                      }
                    }}
                    onKeyDown={(event) => handleDayKeyDown(event, day.dateKey)}
                    className={`c-focus-ring flex h-10 w-full items-center justify-center rounded-md font-medium text-sm transition-colors ${
                      isSelected
                        ? "bg-accent text-on-accent hover:bg-accent"
                        : "bg-surface-panel text-text hover:bg-surface-raised"
                    }`}
                  >
                    {day.dayOfMonth}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function weekRowKey(
  week: readonly BookingMonthGridCell[],
  monthKey: string,
): string {
  for (const cell of week) {
    if (cell.kind === "day") {
      return cell.day.dateKey;
    }
  }
  return `${monthKey}-empty`;
}

export function bookingDayButtonId(monthKey: string, dateKey: string): string {
  return `booking-day-${monthKey}-${dateKey}`;
}
