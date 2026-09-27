import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import {
  getDayjsByTimeValue,
  getTimeOptionByValue,
  parseUserTime,
} from "@web/common/utils/datetime/web.date.util";
import { getEffectiveTimeZone } from "@web/timezone/effective-timezone.store";

/** Longest sequence a typed time can be: HHMM. */
export const QUICK_TIME_MAX_DIGITS = 4;

const DIGITS_ONLY = /^\d{1,4}$/;

/** False once the buffer is HHMM, which is when it can commit immediately. */
export const canQuickTimeBufferGrow = (digits: string) =>
  digits.length < QUICK_TIME_MAX_DIGITS;

/** True when the typed digits name 12 o'clock, not 00 (midnight). */
const isTwelveOClockDigits = (digits: string) => {
  const hour =
    digits.length <= 2
      ? Number.parseInt(digits, 10)
      : Number.parseInt(digits.slice(0, -2), 10);
  return hour === 12;
};

/**
 * Resolve a typed digit sequence to a start time on `targetDay`.
 *
 * The 12-hour ambiguity ("1130" at 9am vs 9pm) is settled by `parseUserTime`'s
 * meridiem inheritance: passing `now` as its current value shifts an hour in
 * 1-11 into PM when now is PM, and leaves 13-23 ("1700") and leading-zero
 * hours ("0500") alone. "12" / "1200"
 * is the exception: parseUserTime would pull those to midnight while the
 * current time is AM, but the shortcut always lands them at noon. Midnight
 * has no advertised sequence.
 */
export function resolveQuickTimeStart(
  digits: string,
  now: Dayjs,
  targetDay: Dayjs,
): Dayjs | null {
  if (!DIGITS_ONLY.test(digits)) return null;

  const parsed = parseUserTime(digits, getTimeOptionByValue(now).value);
  if (!parsed) return null;

  const time = getDayjsByTimeValue(parsed.value);
  if (!time.isValid()) return null;

  const hour =
    time.hour() === 0 && isTwelveOClockDigits(digits) ? 12 : time.hour();

  return targetDay.startOf("day").hour(hour).minute(time.minute());
}

/**
 * The sequence a slot chip advertises for `hour`, or null when no digits-only
 * sequence reaches that hour from `now`.
 *
 * Round-tripping the 24-hour form through `resolveQuickTimeStart` is what makes
 * that guarantee: an advertised chip never lands somewhere else.
 */
export function quickTimeSequenceForHour(
  hour: number,
  now: Dayjs,
  targetDay: Dayjs,
): string | null {
  if (hour === 0) return null;

  const sequence = `${String(hour).padStart(2, "0")}00`;
  const resolved = resolveQuickTimeStart(sequence, now, targetDay);

  return resolved?.hour() === hour ? sequence : null;
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
 * never pile onto a card, and hours with no reachable sequence are dropped
 * by quickTimeSequenceForHour.
 */
export function buildQuickTimeSlots({
  busy,
  now,
  targetDay,
}: {
  busy: readonly QuickTimeBusyInterval[];
  now: Dayjs;
  targetDay: Dayjs;
}): QuickTimeSlot[] {
  const day = targetDay.startOf("day");
  const slots: QuickTimeSlot[] = [];

  for (let hour = 1; hour < 24; hour += 1) {
    const sequence = quickTimeSequenceForHour(hour, now, day);
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
