import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import {
  getDayjsByTimeValue,
  parseUserTime,
} from "@web/common/utils/datetime/web.date.util";
import { getEffectiveTimeZone } from "@web/timezone/effective-timezone.store";

/** Longest sequence a typed time can be: HHMM. */
export const QUICK_TIME_MAX_DIGITS = 4;

const DIGITS_ONLY = /^\d{1,4}$/;

/** False once the buffer is HHMM, which is when it can commit immediately. */
export const canQuickTimeBufferGrow = (digits: string) =>
  digits.length < QUICK_TIME_MAX_DIGITS;

/**
 * Resolve a typed digit sequence to a start time on `targetDay`.
 *
 * Digits are 24-hour clock time, the notation the slot chips advertise:
 * "1100" is 11:00, "2300" is 23:00, "12" and "1200" are noon, "0000" is
 * midnight. Nothing is inherited from the current time, so the same keys
 * land on the same hour whatever the clock says and whichever day is
 * focused. (parseUserTime only infers AM/PM when handed a current value,
 * which the event form's time field does and this shortcut does not.)
 */
export function resolveQuickTimeStart(
  digits: string,
  targetDay: Dayjs,
): Dayjs | null {
  if (!DIGITS_ONLY.test(digits)) return null;

  const parsed = parseUserTime(digits);
  if (!parsed) return null;

  const time = getDayjsByTimeValue(parsed.value);
  if (!time.isValid()) return null;

  return targetDay.startOf("day").hour(time.hour()).minute(time.minute());
}

/**
 * The sequence a slot chip advertises for `hour`. Midnight has no chip: a
 * typed "0000" still works, but there is no useful shortcut to teach.
 */
export function quickTimeSequenceForHour(hour: number): string | null {
  if (hour === 0) return null;

  return `${String(hour).padStart(2, "0")}00`;
}

const dayIsInView = (day: Dayjs, startOfView: Dayjs, endOfView: Dayjs) =>
  day.isBetween(startOfView, endOfView, "day", "[]");

/**
 * The day a typed time lands on. A focused column (jump-selected day, parked
 * empty-grid click, or the day of the focused event) wins when it is still in
 * view. Otherwise today when the view contains it, else the first visible
 * day, the same fallback createAlldayDraft uses so "create an event" means
 * the same day whichever gesture started it.
 */
export const quickTimeTargetDay = (
  startOfView: Dayjs,
  endOfView: Dayjs,
  now: Dayjs,
  focusedDay?: Dayjs | null,
): Dayjs => {
  if (focusedDay && dayIsInView(focusedDay, startOfView, endOfView)) {
    return focusedDay.startOf("day");
  }

  return dayIsInView(now, startOfView, endOfView)
    ? now.startOf("day")
    : startOfView.startOf("day");
};

/** A parked click, then a single jump-highlighted column. */
export const quickTimeFocusedColumnDay = (
  pointerDateKey: string | null,
  activeDayKeys: readonly string[],
): Dayjs | null => {
  const dateKey =
    pointerDateKey ??
    (activeDayKeys.length === 1 ? activeDayKeys[0] : undefined);
  return dateKey
    ? dayjs(dateKey).tz(getEffectiveTimeZone(), true).startOf("day")
    : null;
};

export const quickTimeDayFromEventStart = (
  startDate: string | undefined,
): Dayjs | null =>
  startDate ? dayjs(startDate).tz(getEffectiveTimeZone()) : null;

export type QuickTimeBusyInterval = {
  startMs: number;
  endMs: number;
};

/** Timed cards that can overlap a placeholder; all-day events live in another row. */
export const timedEventsToBusyIntervals = (
  events: readonly { startDate?: string; endDate?: string }[],
): QuickTimeBusyInterval[] =>
  events.flatMap((event) =>
    event.startDate && event.endDate
      ? [
          {
            startMs: dayjs(event.startDate).valueOf(),
            endMs: dayjs(event.endDate).valueOf(),
          },
        ]
      : [],
  );

export type QuickTimeSlot = {
  /** Offset-formatted, so getBusyPeriodPosition can place it like any segment. */
  start: string;
  end: string;
  /** Digits the chip advertises, and that create this slot when typed. */
  sequence: string;
};

/**
 * One placeholder per open hour of `targetDay` except midnight, which has no
 * useful shortcut: hours already covered by an event are dropped so chips
 * never pile onto a card.
 */
export function buildQuickTimeSlots({
  busy,
  targetDay,
}: {
  busy: readonly QuickTimeBusyInterval[];
  targetDay: Dayjs;
}): QuickTimeSlot[] {
  const day = targetDay.startOf("day");
  const slots: QuickTimeSlot[] = [];

  for (let hour = 1; hour < 24; hour += 1) {
    const sequence = quickTimeSequenceForHour(hour);
    if (!sequence) continue;

    const start = day.hour(hour);
    const end = start.add(1, "hour");
    const startMs = start.valueOf();
    const endMs = end.valueOf();
    const isTaken = busy.some(
      (period) => period.startMs < endMs && period.endMs > startMs,
    );
    if (isTaken) continue;

    slots.push({ start: start.format(), end: end.format(), sequence });
  }

  return slots;
}
