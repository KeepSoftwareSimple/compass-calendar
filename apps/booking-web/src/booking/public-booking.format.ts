import { isBookingMonthKey } from "@booking-web/booking/public-booking.keys";
import {
  type BookingSlotsQuery,
  BookingSlotsQuerySchema,
} from "@core/types/booking.contracts";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";

/**
 * Constructing an `Intl.DateTimeFormat` is the expensive part, and the guest
 * page formats one label per open slot and per day cell in the month grid.
 * Build each formatter once per timezone and reuse it. Guests only ever see a
 * handful of zones, so the per-formatter cache stays small.
 */
const perTimeZoneFormatter = (
  options: Omit<Intl.DateTimeFormatOptions, "timeZone">,
  locale?: string,
): ((timeZone: string) => Intl.DateTimeFormat) => {
  const cache = new Map<string, Intl.DateTimeFormat>();
  return (timeZone: string) => {
    const cached = cache.get(timeZone);
    if (cached) {
      return cached;
    }
    const formatter = new Intl.DateTimeFormat(locale, { ...options, timeZone });
    cache.set(timeZone, formatter);
    return formatter;
  };
};

const monthHeadingFormatter = perTimeZoneFormatter({
  month: "long",
  year: "numeric",
});
const timeZoneNameFormatter = perTimeZoneFormatter({ timeZoneName: "long" });
const slotLabelFormatter = perTimeZoneFormatter({
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const slotTimeFormatter = perTimeZoneFormatter({
  hour: "numeric",
  minute: "2-digit",
});
const slotDateHeadingFormatter = perTimeZoneFormatter({
  weekday: "long",
  month: "long",
  day: "numeric",
});
const monthDayLabelFormatter = perTimeZoneFormatter({
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});
const weekdayShortFormatter = perTimeZoneFormatter({ weekday: "short" });
const weekdayLongFormatter = perTimeZoneFormatter({ weekday: "long" });
/** `en-CA` prints ISO date order, which is what a YYYY-MM-DD key needs. */
const dateKeyFormatter = perTimeZoneFormatter(
  { year: "numeric", month: "2-digit", day: "2-digit" },
  "en-CA",
);

export function formatBookingMonthKey(
  instant: Date | string | Dayjs,
  timeZone: string,
): string {
  return dayjs(instant).tz(timeZone).format("YYYY-MM");
}

export function shiftBookingMonthKey(
  monthKey: string,
  delta: number,
  timeZone: string,
): string {
  const monthStart = parseBookingMonthStart(monthKey, timeZone);
  if (!monthStart) {
    return monthKey;
  }
  return monthStart.add(delta, "month").format("YYYY-MM");
}

export function formatBookingMonthHeading(
  monthKey: string,
  timeZone: string,
): string {
  const monthStart = parseBookingMonthStart(monthKey, timeZone);
  if (!monthStart) {
    return monthKey;
  }
  return monthHeadingFormatter(timeZone).format(monthStart.toDate());
}

function parseBookingMonthStart(
  monthKey: string,
  timeZone: string,
): Dayjs | null {
  if (!isBookingMonthKey(monthKey)) {
    return null;
  }
  const monthStart = dayjs.tz(`${monthKey}-01`, timeZone).startOf("month");
  return monthStart.isValid() ? monthStart : null;
}

/**
 * Day-rounded window for one guest-timezone month, clamped to
 * `[today, now + maxHorizonDays]`. Null when the month is entirely in the
 * past or past the host horizon.
 */
export function getPublicBookingMonthWindow(
  monthKey: string,
  timeZone: string,
  maxHorizonDays: number,
  now: Dayjs = dayjs(),
): BookingSlotsQuery | null {
  const monthStart = parseBookingMonthStart(monthKey, timeZone);
  if (!monthStart) {
    return null;
  }

  const todayStart = now.tz(timeZone).startOf("day");
  const nextMonthStart = monthStart.add(1, "month").startOf("month");
  const horizonEnd = now.add(maxHorizonDays, "day");
  const start = monthStart.isBefore(todayStart) ? todayStart : monthStart;
  const end = nextMonthStart.isAfter(horizonEnd) ? horizonEnd : nextMonthStart;

  if (!end.isAfter(start)) {
    return null;
  }

  return BookingSlotsQuerySchema.parse({
    start: start.toISOString(),
    end: end.toISOString(),
    timeZone,
  });
}

export function isBookingMonthAvailable(
  monthKey: string,
  timeZone: string,
  maxHorizonDays: number,
  now: Dayjs = dayjs(),
): boolean {
  return (
    getPublicBookingMonthWindow(monthKey, timeZone, maxHorizonDays, now) != null
  );
}

export function formatGuestTimeZoneLabel(timeZone: string): string {
  try {
    const parts = timeZoneNameFormatter(timeZone).formatToParts(new Date());
    const name = parts.find((part) => part.type === "timeZoneName")?.value;
    return name ?? timeZone;
  } catch {
    return timeZone;
  }
}

export function formatBookingSlotLabel(
  slotStart: string,
  timeZone: string,
): string {
  return slotLabelFormatter(timeZone).format(new Date(slotStart));
}

export function formatBookingSlotTime(
  slotStart: string,
  timeZone: string,
): string {
  return slotTimeFormatter(timeZone).format(new Date(slotStart));
}

export function formatBookingSlotDateHeading(
  slotStart: string,
  timeZone: string,
): string {
  return slotDateHeadingFormatter(timeZone).format(new Date(slotStart));
}

export function formatDurationMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) {
    return `${minutes} minutes`;
  }
  const hourLabel = hours === 1 ? "1 hour" : `${hours} hours`;
  if (remainder === 0) {
    return hourLabel;
  }
  return `${hourLabel} ${remainder} minutes`;
}

/** YYYY-MM-DD in `timeZone`. */
export function formatBookingDateKey(
  instant: Date | string | Dayjs,
  timeZone: string,
): string {
  return dateKeyFormatter(timeZone).format(dayjs(instant).toDate());
}

export function collectBookingAvailableDateKeys(
  slots: readonly { slotStart: string }[],
  timeZone: string,
): Set<string> {
  const keys = new Set<string>();
  for (const slot of slots) {
    keys.add(formatBookingDateKey(slot.slotStart, timeZone));
  }
  return keys;
}

export interface BookingMonthDayCell {
  dateKey: string;
  dayOfMonth: number;
  available: boolean;
  isToday: boolean;
}

export type BookingMonthGridCell =
  | { kind: "pad" }
  | { kind: "day"; day: BookingMonthDayCell };

export function listBookingMonthGridWeeks(
  monthKey: string,
  timeZone: string,
  availableDateKeys: ReadonlySet<string>,
  todayKey: string,
): BookingMonthGridCell[][] {
  const monthStart = parseBookingMonthStart(monthKey, timeZone);
  if (!monthStart) {
    return [];
  }

  const cells: BookingMonthGridCell[] = [];
  for (let pad = 0; pad < monthStart.day(); pad += 1) {
    cells.push({ kind: "pad" });
  }

  const daysInMonth = monthStart.daysInMonth();
  for (let dayOfMonth = 1; dayOfMonth <= daysInMonth; dayOfMonth += 1) {
    const dateKey = monthStart.date(dayOfMonth).format("YYYY-MM-DD");
    cells.push({
      kind: "day",
      day: {
        dateKey,
        dayOfMonth,
        available: dateKey >= todayKey && availableDateKeys.has(dateKey),
        isToday: dateKey === todayKey,
      },
    });
  }

  while (cells.length % 7 !== 0) {
    cells.push({ kind: "pad" });
  }

  const weeks: BookingMonthGridCell[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

export function listBookingAvailableDayKeys(
  weeks: readonly (readonly BookingMonthGridCell[])[],
): string[] {
  const keys: string[] = [];
  for (const week of weeks) {
    for (const cell of week) {
      if (cell.kind === "day" && cell.day.available) {
        keys.push(cell.day.dateKey);
      }
    }
  }
  return keys;
}

export function stepBookingAvailableDay(
  dateKey: string,
  availableDateKeys: readonly string[],
  timeZone: string,
  direction: "previous" | "next" | "previousWeek" | "nextWeek",
): string {
  if (availableDateKeys.length === 0) {
    return dateKey;
  }
  const currentIndex = availableDateKeys.indexOf(dateKey);
  if (currentIndex < 0) {
    return availableDateKeys[0] ?? dateKey;
  }
  if (direction === "previous") {
    return availableDateKeys[Math.max(0, currentIndex - 1)] ?? dateKey;
  }
  if (direction === "next") {
    return (
      availableDateKeys[
        Math.min(availableDateKeys.length - 1, currentIndex + 1)
      ] ?? dateKey
    );
  }

  const weekday = dayjs.tz(dateKey, timeZone).day();
  const sameWeekday = availableDateKeys.filter(
    (key) => dayjs.tz(key, timeZone).day() === weekday,
  );
  const weekdayIndex = sameWeekday.indexOf(dateKey);
  if (weekdayIndex < 0) {
    return dateKey;
  }
  if (direction === "previousWeek") {
    return sameWeekday[Math.max(0, weekdayIndex - 1)] ?? dateKey;
  }
  return (
    sameWeekday[Math.min(sameWeekday.length - 1, weekdayIndex + 1)] ?? dateKey
  );
}

// Any Sunday works: the grid is Sunday-first by design (matching
// listBookingMonthGridWeeks' padding), and only the weekday names are read.
const REFERENCE_SUNDAY = "2026-08-02";

export function listBookingWeekdayHeadings(
  timeZone: string,
): Array<{ short: string; long: string }> {
  const sunday = dayjs.tz(REFERENCE_SUNDAY, timeZone);
  return Array.from({ length: 7 }, (_, index) => {
    const date = sunday.add(index, "day").toDate();
    return {
      short: weekdayShortFormatter(timeZone).format(date),
      long: weekdayLongFormatter(timeZone).format(date),
    };
  });
}

export function formatBookingMonthDayLabel(
  dateKey: string,
  timeZone: string,
): string {
  return monthDayLabelFormatter(timeZone).format(
    dayjs.tz(dateKey, timeZone).toDate(),
  );
}

export function listBookingAvailableDateKeysInMonth(
  slots: readonly { slotStart: string }[],
  monthKey: string,
  timeZone: string,
  todayKey: string,
): string[] {
  return listBookingAvailableDayKeys(
    listBookingMonthGridWeeks(
      monthKey,
      timeZone,
      collectBookingAvailableDateKeys(slots, timeZone),
      todayKey,
    ),
  );
}

/**
 * How many months forward the next-available search will look. Anything past
 * the 60-day horizon is unavailable anyway; 14 leaves margin for timezone
 * month-boundary skew.
 */
export const BOOKING_MONTH_SEARCH_LIMIT = 14;

export function findNextAvailableBookingDate(
  monthKey: string,
  afterDateKey: string | null,
  slotsByMonth: ReadonlyMap<
    string,
    readonly { slotStart: string }[] | undefined
  >,
  timeZone: string,
  todayKey: string,
  maxHorizonDays: number,
  now?: Dayjs,
): { monthKey: string; dateKey: string | null } | null {
  let month = monthKey;
  let after = afterDateKey;
  for (let step = 0; step < BOOKING_MONTH_SEARCH_LIMIT; step += 1) {
    if (!isBookingMonthAvailable(month, timeZone, maxHorizonDays, now)) {
      return null;
    }
    if (!slotsByMonth.has(month)) {
      return { monthKey: month, dateKey: null };
    }
    const days = listBookingAvailableDateKeysInMonth(
      slotsByMonth.get(month) ?? [],
      month,
      timeZone,
      todayKey,
    );
    const afterKey = after;
    const next =
      afterKey == null ? days[0] : days.find((dateKey) => dateKey > afterKey);
    if (next) {
      return { monthKey: month, dateKey: next };
    }
    month = shiftBookingMonthKey(month, 1, timeZone);
    after = null;
  }
  return null;
}
