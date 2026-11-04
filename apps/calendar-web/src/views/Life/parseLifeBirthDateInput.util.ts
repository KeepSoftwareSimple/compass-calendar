import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import { parseUserDate } from "@web/common/utils/datetime/web.date.util";

const YEAR_ONLY_PATTERN = /^(\d{4})$/;
const NUMERIC_MONTH_DAY_YEAR = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/;

export type LifeBirthDateParseResult =
  | { kind: "empty" }
  | { kind: "year"; year: number; preview: string }
  | {
      kind: "date";
      date: Date;
      preview: string;
      ambiguityNote?: string;
    }
  | { kind: "invalid"; message: string };

export const LIFE_BIRTH_DATE_DISPLAY_FORMAT = "MMM D, YYYY";

export function formatLifeBirthDatePreview(date: Date): string {
  return dayjs(date).format(LIFE_BIRTH_DATE_DISPLAY_FORMAT);
}

/** Month and keyboard cursor to show in the day grid for a successful parse. */
export function lifeBirthDateGridAnchor(
  parse: LifeBirthDateParseResult,
): { month: Dayjs; cursor: Dayjs } | null {
  if (parse.kind === "date") {
    const cursor = dayjs(parse.date).startOf("day");
    return { month: cursor.startOf("month"), cursor };
  }
  if (parse.kind === "year") {
    const cursor = dayjs(new Date(parse.year, 0, 1)).startOf("day");
    return { month: cursor.startOf("month"), cursor };
  }
  return null;
}

export function parseLifeBirthDateInput(
  text: string,
  options: { today: Dayjs; minDate: Date; maxDate: Date },
): LifeBirthDateParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { kind: "empty" };

  const yearOnly = trimmed.match(YEAR_ONLY_PATTERN);
  if (yearOnly) {
    const year = Number(yearOnly[1]);
    const maxYear = options.maxDate.getFullYear();
    if (year < 1900 || year > maxYear) {
      return {
        kind: "invalid",
        message: `Enter a year between 1900 and ${maxYear}`,
      };
    }
    return {
      kind: "year",
      year,
      preview: `${year}, pick a day in the calendar`,
    };
  }

  const parsed = parseUserDate(trimmed, options.today);
  if (!parsed) {
    return { kind: "invalid", message: "Could not read that date" };
  }

  const date = parsed.startOf("day").toDate();
  const min = dayjs(options.minDate).startOf("day");
  const max = dayjs(options.maxDate).startOf("day");
  const asDayjs = dayjs(date);

  if (asDayjs.isBefore(min)) {
    return { kind: "invalid", message: "Enter a date in 1900 or later" };
  }
  if (asDayjs.isAfter(max)) {
    return { kind: "invalid", message: "Birth date cannot be in the future" };
  }

  let ambiguityNote: string | undefined;
  const collapsed = trimmed.toLowerCase().replace(/\s+/g, " ");
  const numeric = collapsed.match(NUMERIC_MONTH_DAY_YEAR);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    if (first <= 12 && second <= 12 && first !== second) {
      ambiguityNote = `Read as ${asDayjs.format(LIFE_BIRTH_DATE_DISPLAY_FORMAT)} (U.S. month/day)`;
    }
  }

  return {
    kind: "date",
    date,
    preview: asDayjs.format(LIFE_BIRTH_DATE_DISPLAY_FORMAT),
    ambiguityNote,
  };
}
