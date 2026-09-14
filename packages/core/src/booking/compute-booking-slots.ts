import {
  type BookingDurationMinutes,
  localTimeToMinutes,
  type WeeklyAvailability,
} from "@core/types/booking.contracts";
import dayjs from "@core/util/date/dayjs";

const SLOT_GRID_MINUTES = 15;

/** Half-open [start, end) busy interval on the UTC instant axis. */
export interface BookingBusyInterval {
  start: Date;
  end: Date;
}

export interface ComputeBookingSlotsInput {
  timeZone: string;
  durationMinutes: BookingDurationMinutes;
  weeklyAvailability: WeeklyAvailability;
  minNoticeHours: number;
  maxHorizonDays: number;
  busyIntervals: readonly BookingBusyInterval[];
  confirmedReservationStarts: readonly Date[];
  now: Date;
  windowStart: Date;
  windowEnd: Date;
}

// Matches packages/sync/src/domain/busy-query.service.ts mergeBusyIntervals:
// half-open [start, end), overlapping and touching intervals merge.
export const mergeBookingBusyIntervals = (
  intervals: readonly BookingBusyInterval[],
): BookingBusyInterval[] => {
  const sorted = intervals
    .filter((interval) => interval.end.getTime() > interval.start.getTime())
    .sort(
      (left, right) =>
        left.start.getTime() - right.start.getTime() ||
        left.end.getTime() - right.end.getTime(),
    );

  const merged: BookingBusyInterval[] = [];
  for (const current of sorted) {
    const last = merged[merged.length - 1];
    if (last && current.start.getTime() <= last.end.getTime()) {
      if (current.end.getTime() > last.end.getTime()) {
        last.end = current.end;
      }
    } else {
      merged.push({ start: current.start, end: current.end });
    }
  }
  return merged;
};

const toIsoWeekday = (localDay: dayjs.Dayjs): number => {
  const day = localDay.day();
  return day === 0 ? 7 : day;
};

const slotOverlapsBlockedInterval = (
  slotStart: Date,
  slotEnd: Date,
  blockedStart: Date,
  blockedEnd: Date,
): boolean =>
  slotStart.getTime() < blockedEnd.getTime() &&
  slotEnd.getTime() > blockedStart.getTime();

const isSlotBlocked = (
  slotStart: Date,
  slotEnd: Date,
  blockedIntervals: readonly BookingBusyInterval[],
): boolean =>
  blockedIntervals.some((interval) =>
    slotOverlapsBlockedInterval(
      slotStart,
      slotEnd,
      interval.start,
      interval.end,
    ),
  );

const availabilityForWeekday = (
  weeklyAvailability: WeeklyAvailability,
  weekday: number,
) => weeklyAvailability.filter((interval) => interval.weekday === weekday);

// dayjs.tz isValid stays true for nonexistent spring-forward times; it
// shifts them to the next real instant (02:00 EST → 03:00 EDT). A
// round-trip through the requested wall clock drops those gaps.
// Ambiguous fall-back times use dayjs.tz's earlier offset; later
// repeats of the same wall clock are not a second grid point, and
// seenStarts drops any UTC collision.
const localWallInstant = (wallStart: string, timeZone: string) => {
  const localStart = dayjs.tz(wallStart, "YYYY-MM-DD HH:mm", timeZone);
  if (
    !localStart.isValid() ||
    localStart.format("YYYY-MM-DD HH:mm") !== wallStart
  ) {
    return null;
  }
  return localStart;
};

/**
 * Pure slot engine: weekly hours, busy/reservation overlap, min notice,
 * and horizon. Returns UTC instants valid as slot starts.
 */
export const computeBookingSlots = (
  input: ComputeBookingSlotsInput,
): string[] => {
  const {
    timeZone,
    durationMinutes,
    weeklyAvailability,
    minNoticeHours,
    maxHorizonDays,
    busyIntervals,
    confirmedReservationStarts,
    now,
    windowStart,
    windowEnd,
  } = input;

  if (weeklyAvailability.length === 0) {
    return [];
  }

  const durationMs = durationMinutes * 60_000;
  const minNoticeMs = minNoticeHours * 60 * 60_000;
  const horizonEnd = dayjs(now).add(maxHorizonDays, "day").toDate();

  const reservationIntervals: BookingBusyInterval[] =
    confirmedReservationStarts.map((start) => ({
      start,
      end: new Date(start.getTime() + durationMs),
    }));

  const blockedIntervals = mergeBookingBusyIntervals([
    ...busyIntervals,
    ...reservationIntervals,
  ]);

  const slots: string[] = [];
  const seenStarts = new Set<number>();

  let dayCursor = dayjs(windowStart).tz(timeZone).startOf("day");
  const lastDay = dayjs(windowEnd).tz(timeZone).startOf("day");

  while (dayCursor.isSameOrBefore(lastDay, "day")) {
    const weekday = toIsoWeekday(dayCursor);
    const localDate = dayCursor.format("YYYY-MM-DD");
    const dayAvailability = availabilityForWeekday(weeklyAvailability, weekday);

    for (const interval of dayAvailability) {
      const intervalStartMinutes = localTimeToMinutes(interval.start);
      const intervalEndMinutes = localTimeToMinutes(interval.end);
      let minuteCursor = intervalStartMinutes;

      while (minuteCursor + durationMinutes <= intervalEndMinutes) {
        const hours = Math.floor(minuteCursor / 60);
        const minutes = minuteCursor % 60;
        const wallStart = `${localDate} ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
        const localStart = localWallInstant(wallStart, timeZone);
        if (!localStart) {
          minuteCursor += SLOT_GRID_MINUTES;
          continue;
        }

        const slotStart = localStart.toDate();
        const slotEnd = new Date(slotStart.getTime() + durationMs);
        const localEnd = dayjs(slotEnd).tz(timeZone);
        const endMinutes = localEnd.hour() * 60 + localEnd.minute();
        if (
          localEnd.format("YYYY-MM-DD") !== localDate ||
          endMinutes > intervalEndMinutes
        ) {
          minuteCursor += SLOT_GRID_MINUTES;
          continue;
        }

        const slotStartMs = slotStart.getTime();

        if (
          slotStartMs >= windowStart.getTime() &&
          slotStartMs < windowEnd.getTime() &&
          slotStartMs >= now.getTime() + minNoticeMs &&
          slotStartMs < horizonEnd.getTime() &&
          !isSlotBlocked(slotStart, slotEnd, blockedIntervals) &&
          !seenStarts.has(slotStartMs)
        ) {
          seenStarts.add(slotStartMs);
          slots.push(localStart.utc().format());
        }

        minuteCursor += SLOT_GRID_MINUTES;
      }
    }

    dayCursor = dayCursor.add(1, "day");
  }

  slots.sort();
  return slots;
};
