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
import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import { ACCEPTED_TIMES } from "@web/common/constants/web.constants";
import { type SelectOption } from "@web/common/types/component.types";
import { type TimeOption } from "@web/common/types/util.types";
import { getEffectiveTimeZone } from "@web/timezone/effective-timezone.store";
import { inEffectiveTimeZone } from "@web/timezone/in-time-zone";

interface SelectedDates {
  startDate: Date;
  startTime: SelectOption<string>;
  endDate: Date;
  endTime: SelectOption<string>;
  isAllDay: boolean;
}

export const dateIsValid = (date: string) => {
  const notNaN = !Number.isNaN(new Date(date).getTime());

  const isValid = notNaN;

  return isValid;
};

export const getColorsByHour = (currentHour: number) => {
  const colors: string[] = [];

  [...(new Array(24) as number[])].map((_, index) => {
    // CSS variables (not hex) so the labels land in inline styles that
    // resolve against the active [data-theme].
    const isCurrentHour = currentHour - 1 === index;
    const color = isCurrentHour ? "var(--accent)" : "var(--text-muted)";

    colors.push(color);

    return dayjs()
      .startOf("day")
      .add(index + 1, "hour")
      .format(HOURS_AM_SHORT_FORMAT);
  });

  return colors;
};

export const getDayjsByTimeValue = (timeValue: string) => {
  return dayjs(`2000-01-01 ${timeValue}`, YMDHAM_FORMAT);
};

export const getHourLabels = (includeMidnight = false) => {
  const day = dayjs().startOf("day");
  const hours = includeMidnight ? 24 : 23;

  return [...(new Array(hours) as number[])].map((_, index) => {
    return day.add(index + 1, "hour").format(HOURS_AM_SHORT_FORMAT);
  });
};

const getTimeLabel = (value: string) => value.replace(":00", "");

export const getTimeOptionByValue = (date: Dayjs): TimeOption => {
  const value = dayjs(date).format(HOURS_AM_FORMAT);
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

const expandMeridiem = (mer: string) => {
  const upper = mer.toUpperCase();
  return upper.length === 1 ? `${upper}M` : upper;
};

export const parseUserTime = (
  input: string,
  currentValue?: string,
): TimeOption | null => {
  if (!input || typeof input !== "string") return null;

  // Normalize: trim, uppercase, collapse whitespace
  let normalized = input.trim().toUpperCase().replace(/\s+/g, " ");

  // Handle glued meridiem (e.g., "10:33pm" -> "10:33 PM", "8p" -> "8 PM").
  // Expand A/P so dayjs's AM/PM token can parse them, and skip a dangling
  // colon when the user omitted minutes ("8pm" must not become "8: PM").
  normalized = normalized.replace(
    /^(\d{1,2}):?(\d{0,2})(AM|PM|A|P)$/i,
    (_match, hours: string, minutes: string, mer: string) => {
      const meridiem = expandMeridiem(mer);
      return minutes
        ? `${hours}:${minutes} ${meridiem}`
        : `${hours} ${meridiem}`;
    },
  );

  // Digits-only preprocessing
  const digitsMatch = normalized.match(/^(\d{1,4})$/);
  if (digitsMatch) {
    const digits = digitsMatch[1];
    if (digits.length === 3 || digits.length === 4) {
      const hours = digits.slice(0, -2);
      const minutes = digits.slice(-2);
      normalized = `${hours}:${minutes}`;
    } else if (digits.length === 1 || digits.length === 2) {
      normalized = `${digits}:00`;
    }
  }

  // Try parsing with various formats (meridiem formats first)
  const formats = ["h:mm A", "h:mmA", "h A", "hA", "H:mm", "HH:mm"];
  let parsed: Dayjs | null = null;

  for (const fmt of formats) {
    const candidate = dayjs(normalized, fmt, true);
    if (candidate.isValid()) {
      parsed = candidate;
      break;
    }
  }

  if (!parsed) return null;

  // Validate hour and minute ranges
  if (
    parsed.hour() < 0 ||
    parsed.hour() > 23 ||
    parsed.minute() < 0 ||
    parsed.minute() > 59
  ) {
    return null;
  }

  // A leading zero ("0500", "05:00") is 24-hour notation, so the hour is literal.
  const isTwentyFourHour = /^0\d/.test(normalized);

  // Meridiem inheritance: if input has no explicit AM/PM and hour is 1-12,
  // inherit meridiem from currentValue. Leading-zero hours, 0, and 13-23 are
  // unambiguous.
  if (
    currentValue &&
    !isTwentyFourHour &&
    normalized.toUpperCase().indexOf("A") === -1 &&
    normalized.toUpperCase().indexOf("P") === -1 &&
    parsed.hour() >= 1 &&
    parsed.hour() <= 12
  ) {
    const current = getDayjsByTimeValue(currentValue);
    if (current.isValid()) {
      const currentIsPM = current.hour() >= 12;

      if (currentIsPM && parsed.hour() !== 12) {
        // Current is PM (1-11 PM), so adjust parsed AM hour to PM
        parsed = parsed.add(12, "hour");
      } else if (!currentIsPM && parsed.hour() === 12) {
        // Current is AM, parsed is 12 (12 AM/PM ambiguous), so 12 AM
        parsed = parsed.subtract(12, "hour");
      }
    }
  }

  // Return via getTimeOptionByValue so it normalizes like list options
  return getTimeOptionByValue(parsed);
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

/** Parses a typed calendar date. Month-first for `M/D`. English month names only. */
export const parseUserDate = (text: string, now: Dayjs): Dayjs | null => {
  if (!text || typeof text !== "string") return null;

  const normalized = text
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ");
  if (!normalized) return null;

  const iso = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return calendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const slash = normalized.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    if (slash[3] !== undefined) {
      return calendarDate(expandTwoDigitYear(Number(slash[3])), month, day);
    }
    return dateWithInferredYear(month, day, now);
  }

  const monthFirst = normalized.match(
    new RegExp(
      `^(${MONTH_NAME_PATTERN})(?:\\s+|\\s*,\\s*)(\\d{1,2})(?:(?:\\s+|\\s*,\\s*)(\\d{4}))?$`,
    ),
  );
  if (monthFirst) {
    const month = MONTH_NAME_TO_INDEX[monthFirst[1] ?? ""];
    if (month === undefined) return null;
    const day = Number(monthFirst[2]);
    if (monthFirst[3] !== undefined) {
      return calendarDate(Number(monthFirst[3]), month, day);
    }
    return dateWithInferredYear(month, day, now);
  }

  const dayFirst = normalized.match(
    new RegExp(
      `^(\\d{1,2})(?:\\s+|\\s*,\\s*)(${MONTH_NAME_PATTERN})(?:(?:\\s+|\\s*,\\s*)(\\d{4}))?$`,
    ),
  );
  if (dayFirst) {
    const month = MONTH_NAME_TO_INDEX[dayFirst[2] ?? ""];
    if (month === undefined) return null;
    const day = Number(dayFirst[1]);
    if (dayFirst[3] !== undefined) {
      return calendarDate(Number(dayFirst[3]), month, day);
    }
    return dateWithInferredYear(month, day, now);
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
  option: { label: string; value: string },
  input: string,
  currentValue?: string,
): boolean => {
  const parsed = parseUserTime(input, currentValue);
  if (parsed) {
    return option.value === parsed.value || option.label === parsed.label;
  }

  const needle = input.trim().toLowerCase();
  if (!needle) return true;
  return (
    option.label.toLowerCase().includes(needle) ||
    option.value.toLowerCase().includes(needle)
  );
};

export const getTimesLabel = (startDate: string, endDate: string) => {
  const start = _getTimeLabel(startDate);
  const end = _getTimeLabel(endDate);
  const startMinimal = _cleanStartMeridiem(start, end);

  const label = `${startMinimal} - ${end}`;

  return label;
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

  if (startsThisYear && endsThisYear) {
    return start.format("MMMM YYYY");
  } else if (startsThisYear || endsThisYear) {
    const startLabel = start.format("MMM YY");
    const endLabel = end.format("MMM YY");
    return `${startLabel} - ${endLabel}`;
  } else {
    return start.format("MMMM YYYY");
  }
};

export { getBrowserTimeZone } from "@web/timezone/browser-timezone";

export const mapToBackend = (s: SelectedDates): EventSchedule => {
  if (s.isAllDay) {
    const startDate = dayjs(s.startDate).format(YEAR_MONTH_DAY_FORMAT);
    let endDate = dayjs(s.endDate).format(YEAR_MONTH_DAY_FORMAT);

    // A same-day selection is normalized to an exclusive end by adding one
    // day; a multi-day selection's end already represents an exclusive day.
    if (startDate === endDate) {
      endDate = dayjs(endDate).add(1, "day").format(YEAR_MONTH_DAY_FORMAT);
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
  if (typeof date === "string" || date instanceof Date) {
    return dayjs(date).format();
  } else return date.format(); // then already a DayJs object
};

const _addTimesToDates = (dt: SelectedDates, timeZone: string) => {
  const start = getDayjsByTimeValue(dt.startTime.value);
  const startDate = dayjs
    .tz(dt.startDate, timeZone)
    .hour(start.hour())
    .minute(start.minute())
    .second(0)
    .millisecond(0)
    .format();

  const end = getDayjsByTimeValue(dt.endTime.value);
  // Use endDate (not startDate) so overnight / multi-day timed drafts keep
  // their real end calendar day. Applying the end clock time onto startDate
  // made 11:30 PM → 12:30 AM parse as inverted and blocked Save.
  const endDate = dayjs
    .tz(dt.endDate, timeZone)
    .hour(end.hour())
    .minute(end.minute())
    .second(0)
    .millisecond(0)
    .format();

  return { startDate, endDate };
};

// "6 AM" - "7 AM" reads as "6 - 7 AM": the start's meridiem is redundant when
// the end repeats it. trimEnd because dropping it also leaves the space that
// separated it, which the caller's " - " would double up on.
const _cleanStartMeridiem = (start: string, end: string) => {
  const meridiems = [start.slice(-2), end.slice(-2)];
  const verboseMeridiems = meridiems[0] === meridiems[1];
  if (verboseMeridiems) {
    return start.slice(0, -2).trimEnd();
  }
  return start;
};

const _getTimeLabel = (date: string) =>
  getTimeLabel(inEffectiveTimeZone(date).format(HOURS_AM_FORMAT));

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

  let start: Dayjs;
  let end: Dayjs;

  if (to.duration === "week") {
    start = dayjs(weekViewRange.startDate);
    end = dayjs(weekViewRange.endDate);
  } else {
    // duration is month
    start = reference.startOf("month");
    end = reference.endOf("month");
  }

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

  let start: Dayjs;
  let end: Dayjs;

  if (to.duration === "week") {
    // For prev/next, use the provided week range as reference if available
    const weekRef = reference;
    start = weekRef.startOf("week");
    end = weekRef.endOf("week");

    if (to.direction === "prev") {
      start = start.subtract(1, "week");
      end = end.subtract(1, "week");
    } else if (to.direction === "next") {
      start = start.add(1, "week");
      end = end.add(1, "week");
    }
  } else {
    // duration is month
    start = reference.startOf("month");
    end = reference.endOf("month");

    if (to.direction === "prev") {
      start = start.subtract(1, "month");
      end = end.subtract(1, "month");
    } else if (to.direction === "next") {
      start = start.add(1, "month");
      end = end.add(1, "month");
    }
  }

  return {
    ...event,
    startDate: start.format(),
    endDate: end.format(),
  };
};
