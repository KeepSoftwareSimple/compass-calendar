import {
  type LocalTimeOfDay,
  localTimeToMinutes,
  type WeeklyAvailability,
  type WeeklyAvailabilityInterval,
} from "@core/types/booking.contracts";
import {
  ISO_WEEKDAYS,
  type IsoWeekday,
  weekdayShortLabel,
} from "@web/booking/booking.util";

const LAST_TIME: LocalTimeOfDay = "23:45";
const DEFAULT_START: LocalTimeOfDay = "09:00";
const DEFAULT_END: LocalTimeOfDay = "17:00";

const padTime = (minutes: number): LocalTimeOfDay => {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}` as LocalTimeOfDay;
};

const TIME_VALUES: LocalTimeOfDay[] = [];
for (let minutes = 0; minutes <= localTimeToMinutes(LAST_TIME); minutes += 15) {
  TIME_VALUES.push(padTime(minutes));
}

export const TIME_OPTIONS: readonly LocalTimeOfDay[] = TIME_VALUES;

const sortAvailability = (
  value: WeeklyAvailability,
): WeeklyAvailabilityInterval[] =>
  value
    .slice()
    .sort(
      (left, right) =>
        left.weekday - right.weekday || left.start.localeCompare(right.start),
    );

/** Swap one weekday's intervals for `intervals`, leaving the other days alone. */
const withDayIntervals = (
  value: WeeklyAvailability,
  weekday: IsoWeekday,
  intervals: readonly WeeklyAvailabilityInterval[],
): WeeklyAvailability =>
  sortAvailability([
    ...value.filter((entry) => entry.weekday !== weekday),
    ...intervals,
  ]);

export function intervalsForDay(
  value: WeeklyAvailability,
  weekday: IsoWeekday,
): WeeklyAvailabilityInterval[] {
  return value
    .filter((entry) => entry.weekday === weekday)
    .slice()
    .sort((left, right) => left.start.localeCompare(right.start));
}

export function setDayAvailable(
  value: WeeklyAvailability,
  weekday: IsoWeekday,
  available: boolean,
): WeeklyAvailability {
  if (!available) {
    return sortAvailability(value.filter((entry) => entry.weekday !== weekday));
  }
  if (intervalsForDay(value, weekday).length > 0)
    return sortAvailability(value);
  return sortAvailability([
    ...value,
    { weekday, start: DEFAULT_START, end: DEFAULT_END },
  ]);
}

export function canAddBlock(
  value: WeeklyAvailability,
  weekday: IsoWeekday,
): boolean {
  const last = intervalsForDay(value, weekday).at(-1);
  if (last == null) return false;
  return localTimeToMinutes(last.end) + 60 < localTimeToMinutes(LAST_TIME);
}

export function addBlock(
  value: WeeklyAvailability,
  weekday: IsoWeekday,
): WeeklyAvailability {
  const last = intervalsForDay(value, weekday).at(-1);
  if (last == null) return value;
  const startMinutes = localTimeToMinutes(last.end) + 60;
  if (startMinutes >= localTimeToMinutes(LAST_TIME)) return value;
  const start = padTime(startMinutes);
  const end = padTime(
    Math.min(startMinutes + 60, localTimeToMinutes(LAST_TIME)),
  );
  return sortAvailability([...value, { weekday, start, end }]);
}

export function removeBlock(
  value: WeeklyAvailability,
  weekday: IsoWeekday,
  index: number,
): WeeklyAvailability {
  const day = intervalsForDay(value, weekday);
  if (day[index] == null) return sortAvailability(value);
  return withDayIntervals(
    value,
    weekday,
    day.filter((_, position) => position !== index),
  );
}

export function updateBlock(
  value: WeeklyAvailability,
  weekday: IsoWeekday,
  index: number,
  patch: { start?: LocalTimeOfDay; end?: LocalTimeOfDay },
): WeeklyAvailability {
  const day = intervalsForDay(value, weekday);
  const current = day[index];
  if (current == null) return sortAvailability(value);
  const next = day[index + 1];
  const start = patch.start ?? current.start;
  let end = patch.end ?? current.end;
  if (patch.start != null) {
    end = snapEndAfterStart(start, end);
    if (
      next != null &&
      localTimeToMinutes(end) > localTimeToMinutes(next.start)
    ) {
      end = next.start;
    }
  }
  return withDayIntervals(
    value,
    weekday,
    day.map((entry, position) =>
      position === index ? { ...entry, start, end } : entry,
    ),
  );
}

export function startOptions(
  value: WeeklyAvailability,
  weekday: IsoWeekday,
  index: number,
): readonly LocalTimeOfDay[] {
  const day = intervalsForDay(value, weekday);
  const current = day[index];
  if (current == null) return TIME_OPTIONS;
  const previous = day[index - 1];
  const minMinutes = previous == null ? 0 : localTimeToMinutes(previous.end);
  const endMinutes = localTimeToMinutes(current.end);
  return TIME_OPTIONS.filter((time) => {
    const minutes = localTimeToMinutes(time);
    return minutes >= minMinutes && minutes < endMinutes;
  });
}

export function endOptions(
  value: WeeklyAvailability,
  weekday: IsoWeekday,
  index: number,
): readonly LocalTimeOfDay[] {
  const day = intervalsForDay(value, weekday);
  const current = day[index];
  if (current == null) return TIME_OPTIONS;
  const next = day[index + 1];
  const startMinutes = localTimeToMinutes(current.start);
  const maxMinutes =
    next == null
      ? localTimeToMinutes(LAST_TIME)
      : localTimeToMinutes(next.start);
  const options = TIME_OPTIONS.filter((time) => {
    const minutes = localTimeToMinutes(time);
    return minutes > startMinutes && minutes <= maxMinutes;
  });
  if (options.includes(current.end)) return options;
  return [...options, current.end].sort((left, right) =>
    left.localeCompare(right),
  );
}

export function formatTimeLabel(time: LocalTimeOfDay): string {
  const [hoursText, minutes] = time.split(":");
  const hours = Number(hoursText);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${minutes} ${suffix}`;
}

/** When Start moves past End, End becomes Start plus one hour, capped at 23:45. */
export function snapEndAfterStart(
  start: LocalTimeOfDay,
  end: LocalTimeOfDay,
): LocalTimeOfDay {
  if (localTimeToMinutes(end) > localTimeToMinutes(start)) return end;
  return padTime(
    Math.min(localTimeToMinutes(start) + 60, localTimeToMinutes(LAST_TIME)),
  );
}

const intervalKey = (
  intervals: readonly WeeklyAvailabilityInterval[],
): string =>
  intervals.map((interval) => `${interval.start}|${interval.end}`).join(",");

const formatDayTimes = (
  intervals: readonly WeeklyAvailabilityInterval[],
): string =>
  intervals
    .map(
      (interval) =>
        `${formatTimeLabel(interval.start)} to ${formatTimeLabel(interval.end)}`,
    )
    .join(" and ");

const summarizeWeekdays = (days: readonly IsoWeekday[]): string => {
  if (days.length >= 2 && isConsecutive(days)) {
    return `${weekdayShortLabel(days[0]!)} to ${weekdayShortLabel(days[days.length - 1]!)}`;
  }
  return days.map(weekdayShortLabel).join(", ");
};

const isConsecutive = (days: readonly IsoWeekday[]): boolean => {
  for (let index = 1; index < days.length; index += 1) {
    if (days[index] !== days[index - 1]! + 1) return false;
  }
  return true;
};

export function summarizeAvailability(value: WeeklyAvailability): string {
  const groups: {
    days: IsoWeekday[];
    intervals: WeeklyAvailabilityInterval[];
  }[] = [];

  for (const weekday of ISO_WEEKDAYS) {
    const intervals = intervalsForDay(value, weekday);
    if (intervals.length === 0) continue;
    const last = groups[groups.length - 1];
    if (
      last != null &&
      last.days[last.days.length - 1] === weekday - 1 &&
      intervalKey(last.intervals) === intervalKey(intervals)
    ) {
      last.days.push(weekday);
      continue;
    }
    groups.push({ days: [weekday], intervals });
  }

  return groups
    .map(
      (group) =>
        `${summarizeWeekdays(group.days)}, ${formatDayTimes(group.intervals)}`,
    )
    .join("; ");
}
