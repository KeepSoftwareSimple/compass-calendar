import { type Dayjs } from "@core/util/date/dayjs";

export const MONTH_PICKER_IN_VIEW_CLASS = "react-datepicker__day--in-view";

export function getMonthPickerDayClassName({
  date,
  selectedDate,
  selectedEnd = selectedDate,
  viewEnd,
  viewStart,
}: {
  date: Dayjs;
  selectedDate: Dayjs;
  /** Last day of the cursor unit (the week end in week mode). */
  selectedEnd?: Dayjs;
  viewEnd: Dayjs;
  viewStart: Dayjs;
}): string {
  const isSelected = date.isBetween(selectedDate, selectedEnd, "day", "[]");
  const classes = [isSelected ? "!font-semibold" : "!font-light"];

  if (date.isBetween(viewStart, viewEnd, "day", "[]")) {
    classes.push(MONTH_PICKER_IN_VIEW_CLASS);
  }

  return classes.join(" ");
}
