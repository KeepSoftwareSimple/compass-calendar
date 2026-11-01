import { ZodError } from "zod/v4";
import {
  HOURS_AM_FORMAT,
  HOURS_AM_SHORT_FORMAT,
  YEAR_MONTH_DAY_FORMAT,
  YMDHAM_FORMAT,
} from "@core/constants/date.constants";
import { type CompassEvent } from "@core/types/compass-event.contracts";
import {
  type EventSchedule,
  EventScheduleSchema,
} from "@core/types/event.contracts";
import { atCivilTime, civilHourLineInstants } from "@core/util/date/civil-day";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import { ACCEPTED_TIMES } from "@web/common/constants/web.constants";
import { type SelectOption } from "@web/common/types/component.types";
import { type TimeOption } from "@web/common/types/util.types";
import { getEffectiveTimeZone } from "@web/timezone/effective-timezone.store";
import {
  calendarDateInEffectiveTimeZone,
  inEffectiveTimeZone,
  nowInEffectiveTimeZone,
} from "@web/timezone/in-time-zone";
import { parseGridScheduleDate } from "@web/timezone/parse-grid-schedule-date";

interface SelectedDates {
  startDate: Date;
  startTime: SelectOption<string>;
  endDate: Date;
  endTime: SelectOption<string>;
  isAllDay: boolean;
}

/**
 * One color per hour label, accenting the label for the current hour.
 *
 * Labels run 1 AM through midnight, so the hour at index `i` is `i + 1` and
 * `currentHour` matches at `currentHour - 1`. CSS variables (not hex) so the
 * colors land in inline styles that resolve against the active [data-theme].
 */
export const getColorsByHour = (
  currentHour: number,
  slotCount = 24,
): string[] =>
  Array.from({ length: slotCount }, (_, index) =>
    currentHour - 1 === index ? "var(--accent)" : "var(--text-muted)",
  );

export const getDayjsByTimeValue = (timeValue: string) => {
  return dayjs(`2000-01-01 ${timeValue}`, YMDHAM_FORMAT);
};

export const getHourLabels = (
  includeMidnight = false,
  referenceDay: Dayjs | Date | string = nowInEffectiveTimeZone(),
  timeZone: string = getEffectiveTimeZone(),
) =>
  civilHourLineInstants(referenceDay, timeZone, includeMidnight).map(
    (instant) => instant.format(HOURS_AM_SHORT_FORMAT),
  );

const getTimeLabel = (value: string) => value.replace(":00", "");

export const getTimeOptionByValue = (
  date: Dayjs,
  timeZone: string = getEffectiveTimeZone(),
): TimeOption => {
  const value = inEffectiveTimeZone(date, timeZone).format(HOURS_AM_FORMAT);
  const label = getTimeLabel(value);

  return {
    label,
    value,
  };
};

export const getTimeOptions = (): TimeOption[] => {
  const options = ACCEPTED_TIMES.map((value) => {
    const label = getTimeLabel(value);

    return {
      label,
      value,
    };
  });

  return options;
};

// Hours, optional minutes (with or without a ":", "." or "h" separator), and an
// optional a/p/am/pm/a.m./p.m. suffix, matched after whitespace is removed.
// "430", "4:30", "4.30", "430 am", "4:30p", and "16h30" all parse.
const USER_TIME_PATTERN = /^(\d{1,2})(?:[:.h]?(\d{2}))?(?:([ap])\.?m?\.?)?$/;

export type ParseUserTimeOptions = {
  /** Value already shown in this picker (meridiem fallback). */
  currentValue?: string;
  /** The other side of the range (start when editing end, and vice versa). */
  complementaryValue?: string;
  role?: "start" | "end";
};

export const minutesFromTimeValue = (timeValue: string): number | null => {
  const parsed = getDayjsByTimeValue(timeValue);
  if (!parsed.isValid()) return null;
  return parsed.hour() * 60 + parsed.minute();
};

const minutesFromOptional = (timeValue?: string): number | null =>
  timeValue ? minutesFromTimeValue(timeValue) : null;

const ambiguousCandidates = (hour: number, minute: number): number[] => {
  if (hour === 12) {
    return [minute, 12 * 60 + minute];
  }
  return [hour * 60 + minute, (hour + 12) * 60 + minute];
};

const pickEarliestAfterReference = (
  candidates: number[],
  referenceMinutes: number,
): number => {
  const laterToday = candidates.filter(
    (candidate) => candidate > referenceMinutes,
  );
  if (laterToday.length > 0) {
    return Math.min(...laterToday);
  }
  return Math.min(...candidates);
};

const circularMinuteDistance = (a: number, b: number): number => {
  const diff = Math.abs(a - b);
  return Math.min(diff, 1440 - diff);
};

const pickNearestToReference = (
  candidates: number[],
  referenceMinutes: number,
): number =>
  candidates.reduce((best, candidate) =>
    circularMinuteDistance(candidate, referenceMinutes) <
    circularMinuteDistance(best, referenceMinutes)
      ? candidate
      : best,
  );

const resolveAmbiguousMinutes = (
  hour: number,
  minute: number,
  options: ParseUserTimeOptions,
): number => {
  const candidates = ambiguousCandidates(hour, minute);
  const complementaryMinutes = minutesFromOptional(options.complementaryValue);
  const currentMinutes = minutesFromOptional(options.currentValue);
  const fallback = hour === 12 ? 12 * 60 + minute : hour * 60 + minute;

  if (options.role === "end" && complementaryMinutes !== null) {
    return pickEarliestAfterReference(candidates, complementaryMinutes);
  }

  if (options.role === "start") {
    let pool = candidates;
    if (complementaryMinutes !== null) {
      const beforeEnd = candidates.filter(
        (candidate) => candidate < complementaryMinutes,
      );
      if (beforeEnd.length > 0) {
        pool = beforeEnd;
      }
    }

    const reference = currentMinutes ?? complementaryMinutes;
    if (reference !== null) {
      return pickNearestToReference(pool, reference);
    }
  }

  if (options.currentValue) {
    const current = getDayjsByTimeValue(options.currentValue);
    if (current.isValid()) {
      const currentIsPM = current.hour() >= 12;
      if (currentIsPM && hour !== 12) return (hour + 12) * 60 + minute;
      if (!currentIsPM && hour === 12) return minute;
      return fallback;
    }
  }

  return fallback;
};

const minutesToClock = (minutes: number): { hour: number; minute: number } => ({
  hour: Math.floor(minutes / 60) % 24,
  minute: minutes % 60,
});

export const parseUserTime = (
  input: string,
  options: ParseUserTimeOptions = {},
): TimeOption | null => {
  if (!input || typeof input !== "string") return null;

  const match = input
    .toLowerCase()
    .replace(/\s+/g, "")
    .match(USER_TIME_PATTERN);
  if (!match) return null;

  const [, hourText, minuteText = "0", meridiem] = match;
  let hour = Number(hourText);
  let minute = Number(minuteText);
  if (minute > 59) return null;

  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem === "p" ? 12 : 0);
  } else if (hour > 23) {
    return null;
  } else if (!hourText?.startsWith("0") && hour >= 1 && hour <= 12) {
    ({ hour, minute } = minutesToClock(
      resolveAmbiguousMinutes(hour, minute, options),
    ));
  }

  return getTimeOptionByValue(
    nowInEffectiveTimeZone().startOf("day").hour(hour).minute(minute),
  );
};

const MONTH_NAME_TO_INDEX: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

const MONTH_NAME_PATTERN = Object.keys(MONTH_NAME_TO_INDEX)
  .sort((a, b) => b.length - a.length)
  .join("|");

const expandTwoDigitYear = (year: number): number =>
  year >= 100 ? year : 2000 + year;

const calendarDate = (
  year: number,
  month: number,
  day: number,
): Dayjs | null => {
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return null;
  }
  if (year < 1000 || year > 9999) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const date = dayjs(iso, YEAR_MONTH_DAY_FORMAT, true);
  if (!date.isValid()) return null;
  if (
    date.year() !== year ||
    date.month() + 1 !== month ||
    date.date() !== day
  ) {
    return null;
  }
  return date.startOf("day");
};

const dateWithInferredYear = (
  month: number,
  day: number,
  now: Dayjs,
): Dayjs | null => {
  const thisYear = calendarDate(now.year(), month, day);
  if (!thisYear) return null;
  const cutoff = now.startOf("day").subtract(6, "month");
  if (thisYear.isBefore(cutoff)) {
    return calendarDate(now.year() + 1, month, day);
  }
  return thisYear;
};

/** US month-first when both parts are at most 12; otherwise unambiguous D/M. */
const resolveMonthDayOrder = (
  first: number,
  second: number,
): { month: number; day: number } | null => {
  if (first < 1 || second < 1 || first > 31 || second > 31) return null;
  if (first > 12 && second > 12) return null;
  if (first > 12) return { month: second, day: first };
  if (second > 12) return { month: first, day: second };
  return { month: first, day: second };
};

/** Same separator for every part so `2026-10/03` stays rejected. */
const YEAR_FIRST_DATE_PATTERN = /^(\d{4})([-/.])(\d{1,2})(?:\2(\d{1,2}))?$/;
const NUMERIC_DATE_PATTERN = /^(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2}|\d{4}))?$/;
const MONTH_YEAR_PATTERN = new RegExp(`^(${MONTH_NAME_PATTERN})\\s+(\\d{4})$`);
const YEAR_MONTH_NAME_PATTERN = new RegExp(
  `^(\\d{4})\\s+(${MONTH_NAME_PATTERN})$`,
);
const MONTH_FIRST_PATTERN = new RegExp(
  `^(${MONTH_NAME_PATTERN})(?:\\s+|\\s*,\\s*)(\\d{1,2})(?:(?:\\s+|\\s*,\\s*)(\\d{4}))?$`,
);
const DAY_FIRST_PATTERN = new RegExp(
  `^(\\d{1,2})(?:\\s+|\\s*,\\s*)(${MONTH_NAME_PATTERN})(?:(?:\\s+|\\s*,\\s*)(\\d{4}))?$`,
);

const namedMonthDate = (
  monthName: string | undefined,
  dayText: string | undefined,
  yearText: string | undefined,
  now: Dayjs,
): Dayjs | null => {
  const month = monthName ? MONTH_NAME_TO_INDEX[monthName] : undefined;
  if (month === undefined) return null;
  if (dayText === undefined) {
    return yearText === undefined
      ? null
      : calendarDate(Number(yearText), month, 1);
  }
  const day = Number(dayText);
  return yearText === undefined
    ? dateWithInferredYear(month, day, now)
    : calendarDate(Number(yearText), month, day);
};

/** Parses a typed calendar date. Month-first for `M/D`. English month names only. */
export const parseUserDate = (text: string, now: Dayjs): Dayjs | null => {
  if (!text || typeof text !== "string") return null;

  const collapsed = text.trim().toLowerCase().replace(/\s+/g, " ");
  if (!collapsed) return null;

  const yearFirst = collapsed.match(YEAR_FIRST_DATE_PATTERN);
  if (yearFirst) {
    return calendarDate(
      Number(yearFirst[1]),
      Number(yearFirst[3]),
      yearFirst[4] === undefined ? 1 : Number(yearFirst[4]),
    );
  }

  const numeric = collapsed.match(NUMERIC_DATE_PATTERN);
  if (numeric) {
    const resolved = resolveMonthDayOrder(
      Number(numeric[1]),
      Number(numeric[2]),
    );
    if (!resolved) return null;
    return numeric[3] === undefined
      ? dateWithInferredYear(resolved.month, resolved.day, now)
      : calendarDate(
          expandTwoDigitYear(Number(numeric[3])),
          resolved.month,
          resolved.day,
        );
  }

  const normalized = collapsed.replace(/\./g, "");

  const monthYear = normalized.match(MONTH_YEAR_PATTERN);
  if (monthYear) {
    return namedMonthDate(monthYear[1], undefined, monthYear[2], now);
  }

  const yearMonthName = normalized.match(YEAR_MONTH_NAME_PATTERN);
  if (yearMonthName) {
    return namedMonthDate(yearMonthName[2], undefined, yearMonthName[1], now);
  }

  const monthFirst = normalized.match(MONTH_FIRST_PATTERN);
  if (monthFirst) {
    return namedMonthDate(monthFirst[1], monthFirst[2], monthFirst[3], now);
  }

  const dayFirst = normalized.match(DAY_FIRST_PATTERN);
  if (dayFirst) {
    return namedMonthDate(dayFirst[2], dayFirst[1], dayFirst[3], now);
  }

  return null;
};

export const goToDatePaletteLabel = (date: Dayjs): string =>
  `Go to ${date.format("ddd, MMM D, YYYY")}`;

export const goToDateAnnouncement = (
  date: Dayjs,
  view: "day" | "week" | "life",
): string =>
  view === "day"
    ? `Showing ${date.format("dddd, MMMM D, YYYY")}`
    : `Showing week of ${date.format("dddd, MMMM D, YYYY")}`;

export const filterTimeOption = (
  option: TimeOption,
  input: string,
  context?: ParseUserTimeOptions,
): boolean => {
  const parsed = parseUserTime(input, context);
  if (parsed) {
    return option.value === parsed.value || option.label === parsed.label;
  }

  // Partial input ("43", "12:4"): compare letters and digits only,
  // so "43" finds 4:30 AM and 4:30 PM.
  const compact = (text: string) =>
    text.toLowerCase().replace(/[^a-z0-9]/g, "");
  const needle = compact(input);
  if (!needle) return true;
  return (
    compact(option.label).includes(needle) ||
    compact(option.value).includes(needle)
  );
};

export const getTimesLabel = (
  startDate: string,
  endDate: string,
  timeZone: string = getEffectiveTimeZone(),
) => {
  const start = _getTimeLabel(startDate, timeZone);
  const end = _getTimeLabel(endDate, timeZone);
  return formatMeridiemRangeLabel(start, end);
};

/** Grid card labels follow pinned calendar zone placement, not the event zone wall clock. */
export const getGridCardTimesLabel = (
  startDate: string,
  endDate: string,
  eventTimeZone?: string | null,
): string => {
  const calendarTimeZone = getEffectiveTimeZone();
  const eventZone = eventTimeZone ?? calendarTimeZone;
  const start = parseGridScheduleDate(startDate, eventZone).tz(
    calendarTimeZone,
  );
  const end = parseGridScheduleDate(endDate, eventZone).tz(calendarTimeZone);
  const startLabel = getTimeLabel(start.format(HOURS_AM_FORMAT));
  const endLabel = getTimeLabel(end.format(HOURS_AM_FORMAT));
  return formatMeridiemRangeLabel(startLabel, endLabel);
};

export const getWeekRangeLabel = (weekStart: Dayjs, weekEnd: Dayjs) => {
  const isSameMonth = weekStart.month() === weekEnd.month();
  const start = weekStart.format("M.D");
  const end = weekEnd.format(isSameMonth ? "D" : "M.D");
  const label = `${start} - ${end}`;
  return label;
};

export const getCalendarHeadingLabel = (
  start: Dayjs,
  end: Dayjs,
  now: Dayjs,
) => {
  const startsThisYear = now.year() === start.year();
  const endsThisYear = now.year() === end.year();

  // A week that straddles two months is labeled by the month of today when
  // today is in view, so the label flips on the 1st instead of at week end.
  const todayInView = !now.isBefore(start, "day") && !now.isAfter(end, "day");
  const anchor = todayInView ? now : start;

  if (startsThisYear && endsThisYear) {
    return anchor.format("MMMM YYYY");
  } else if (startsThisYear || endsThisYear) {
    const startLabel = start.format("MMM YY");
    const endLabel = end.format("MMM YY");
    return `${startLabel} - ${endLabel}`;
  } else {
    return anchor.format("MMMM YYYY");
  }
};

export { getBrowserTimeZone } from "@web/timezone/browser-timezone";

export const mapToBackend = (s: SelectedDates): EventSchedule => {
  if (s.isAllDay) {
    const timeZone = getEffectiveTimeZone();
    const startDate = inEffectiveTimeZone(s.startDate, timeZone).format(
      YEAR_MONTH_DAY_FORMAT,
    );
    let endDate = inEffectiveTimeZone(s.endDate, timeZone).format(
      YEAR_MONTH_DAY_FORMAT,
    );

    // A same-day selection is normalized to an exclusive end by adding one
    // day; a multi-day selection's end already represents an exclusive day.
    if (startDate === endDate) {
      endDate = calendarDateInEffectiveTimeZone(endDate, timeZone)
        .add(1, "day")
        .format(YEAR_MONTH_DAY_FORMAT);
    }

    return EventScheduleSchema.parse({
      kind: "allDay",
      start: startDate,
      end: endDate,
    });
  }

  const timeZone = getEffectiveTimeZone();
  const { startDate, endDate } = _addTimesToDates(s, timeZone);

  return EventScheduleSchema.parse({
    kind: "timed",
    start: startDate,
    end: endDate,
    timeZone,
  });
};

export type MapToBackendResult =
  | { ok: true; schedule: EventSchedule }
  | { ok: false };

/** Same as `mapToBackend`, but returns a result instead of throwing on schema failure. */
export const tryMapToBackend = (s: SelectedDates): MapToBackendResult => {
  try {
    return { ok: true, schedule: mapToBackend(s) };
  } catch (error) {
    if (error instanceof ZodError) return { ok: false };
    throw error;
  }
};

// uses inferred timezone and shortened string to
// convert to a string format that the backend/gcal/mongo accepts:
// '2022-02-04 12:15' -> '2022-02-04T12:15:00-06:00'
export const toUTCOffset = (date: string | Dayjs | Date) => {
  if (typeof date === "string") {
    return dayjs(date).format();
  }
  if (date instanceof Date) {
    return inEffectiveTimeZone(date).format();
  }
  return date.format();
};

const _addTimesToDates = (dt: SelectedDates, timeZone: string) => {
  const start = getDayjsByTimeValue(dt.startTime.value);
  const startYmd = inEffectiveTimeZone(dt.startDate, timeZone).format(
    YEAR_MONTH_DAY_FORMAT,
  );
  const startDate = atCivilTime(
    startYmd,
    timeZone,
    start.hour(),
    start.minute(),
  ).format();

  const end = getDayjsByTimeValue(dt.endTime.value);
  // Use endDate (not startDate) so overnight / multi-day timed drafts keep
  // their real end calendar day. Applying the end clock time onto startDate
  // made 11:30 PM → 12:30 AM parse as inverted and blocked Save.
  const endYmd = inEffectiveTimeZone(dt.endDate, timeZone).format(
    YEAR_MONTH_DAY_FORMAT,
  );
  const endDate = atCivilTime(
    endYmd,
    timeZone,
    end.hour(),
    end.minute(),
  ).format();

  return { startDate, endDate };
};

// "6 AM" - "7 AM" reads as "6 - 7 AM": the start's meridiem is redundant when
// the end repeats it. trimEnd because dropping it also leaves the space that
// separated it, which the caller's " - " would double up on.
const formatMeridiemRangeLabel = (startLabel: string, endLabel: string) =>
  `${_cleanStartMeridiem(startLabel, endLabel)} - ${endLabel}`;

const _cleanStartMeridiem = (start: string, end: string) => {
  const meridiems = [start.slice(-2), end.slice(-2)];
  const verboseMeridiems = meridiems[0] === meridiems[1];
  if (verboseMeridiems) {
    return start.slice(0, -2).trimEnd();
  }
  return start;
};

const _getTimeLabel = (
  date: string,
  timeZone: string = getEffectiveTimeZone(),
) => getTimeLabel(inEffectiveTimeZone(date, timeZone).format(HOURS_AM_FORMAT));

export const computeCurrentEventDateRange = (
  to: {
    duration: "week" | "month";
  },
  event: CompassEvent,
  weekViewRange: {
    startDate: string;
    endDate: string;
  },
): CompassEvent => {
  const reference = dayjs(weekViewRange.startDate);

  // A week is already the range the grid is showing; a month is derived from
  // the week it contains.
  const { start, end } =
    to.duration === "week"
      ? { start: reference, end: dayjs(weekViewRange.endDate) }
      : { start: reference.startOf("month"), end: reference.endOf("month") };

  return {
    ...event,
    startDate: start.format(),
    endDate: end.format(),
  };
};

export const computeRelativeEventDateRange = (
  to: {
    direction: "prev" | "next";
    duration: "week" | "month";
  },
  event: CompassEvent,
): CompassEvent => {
  const reference = dayjs(event.startDate);
  const unit = to.duration;
  const shift = to.direction === "prev" ? -1 : 1;
  const start = reference.startOf(unit).add(shift, unit);
  const end = reference.endOf(unit).add(shift, unit);

  return {
    ...event,
    startDate: start.format(),
    endDate: end.format(),
  };
};
