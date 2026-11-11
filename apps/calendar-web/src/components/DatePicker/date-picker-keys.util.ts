import dayjs, { type Dayjs } from "@core/util/date/dayjs";

/** Keys a closed date field acts on itself (web fields, Mac parity). */
const CLOSED_FIELD_KEYS = ["ArrowDown", "ArrowUp", "Enter", " "] as const;

/** Keys an open `react-datepicker` grid acts on (web fields, Mac parity). */
const CALENDAR_KEYS = [
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Enter",
  " ",
  "Escape",
] as const;

export type DatePickerClosedFieldKey = (typeof CLOSED_FIELD_KEYS)[number];

export type DatePickerCalendarKey = (typeof CALENDAR_KEYS)[number];

const closedFieldKeys: ReadonlySet<string> = new Set(CLOSED_FIELD_KEYS);
const calendarKeys: ReadonlySet<string> = new Set(CALENDAR_KEYS);

export const isDatePickerClosedFieldKey = (
  key: string,
): key is DatePickerClosedFieldKey => closedFieldKeys.has(key);

export const isDatePickerCalendarKey = (
  key: string,
): key is DatePickerCalendarKey => calendarKeys.has(key);

export type DatePickerCalendarAction =
  | { kind: "moveCursor"; days: number }
  | { kind: "pickCursor" }
  | { kind: "close" };

/** Open-calendar keys (web `react-datepicker` parity with Mac). */
export const calendarAction = (
  key: DatePickerCalendarKey,
): DatePickerCalendarAction => {
  switch (key) {
    case "ArrowLeft":
      return { kind: "moveCursor", days: -1 };
    case "ArrowRight":
      return { kind: "moveCursor", days: 1 };
    case "ArrowUp":
      return { kind: "moveCursor", days: -7 };
    case "ArrowDown":
      return { kind: "moveCursor", days: 7 };
    case "Enter":
    case " ":
      return { kind: "pickCursor" };
    case "Escape":
      return { kind: "close" };
  }
};

export type DatePickerPageStep = { unit: "month" | "year"; delta: number };

/**
 * PageDown/PageUp page the open calendar forward/back by a month, or by a year
 * with Shift. Returns null for every other key so callers can fall through.
 */
export const datePickerPageStep = (
  key: string,
  shiftKey: boolean,
): DatePickerPageStep | null => {
  const delta = key === "PageDown" ? 1 : key === "PageUp" ? -1 : 0;
  if (delta === 0) return null;
  return { unit: shiftKey ? "year" : "month", delta };
};

export const movePickerCursor = (
  cursor: Dayjs | null,
  anchor: Date,
  days: number,
): Dayjs => (cursor ?? dayjs(anchor)).add(days, "day");
