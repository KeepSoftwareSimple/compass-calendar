import { type Dayjs } from "@core/util/date/dayjs";

/**
 * How the sidebar month picker's cursor moves. Week view steps whole week
 * rows; Day view steps single days.
 */
export type MonthPickerUnit = "day" | "week";

/** First day of the picker week that contains `date`, honoring the view's
 * start-of-week (0 = Sunday, 1 = Monday, ...). */
export const startOfPickerWeek = (date: Dayjs, weekStartDay: number): Dayjs =>
  date.subtract((date.day() - weekStartDay + 7) % 7, "day").startOf("day");

/** Normalize a cursor to the unit's anchor: the week start in week mode. */
export const normalizePickerCursor = (
  date: Dayjs,
  unit: MonthPickerUnit,
  weekStartDay: number,
): Dayjs =>
  unit === "week" ? startOfPickerWeek(date, weekStartDay) : date.startOf("day");

/**
 * Where the cursor lands after an explicit month jump (chevrons, month
 * chords, the today button). Keeps the day-of-month, clamped to the target
 * month's length, then snaps to the unit's anchor. In week mode the anchor
 * must stay inside the target month: react-datepicker only shows the tab
 * stop when the `selected` week start is rendered, and a week start in the
 * previous month would leave the displayed month without one.
 */
export const resolveMonthJumpCursor = ({
  cursor,
  targetMonth,
  unit,
  weekStartDay,
}: {
  cursor: Dayjs;
  targetMonth: Dayjs;
  unit: MonthPickerUnit;
  weekStartDay: number;
}): Dayjs => {
  const month = targetMonth.startOf("month");
  const sameDay = month.date(Math.min(cursor.date(), month.daysInMonth()));
  const anchored = normalizePickerCursor(sameDay, unit, weekStartDay);
  if (unit === "week" && anchored.isBefore(month, "day")) {
    return anchored.add(1, "week");
  }
  return anchored;
};
