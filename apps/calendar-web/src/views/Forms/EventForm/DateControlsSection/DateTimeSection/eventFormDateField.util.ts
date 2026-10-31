import dayjs from "@core/util/date/dayjs";
import { type SelectOption } from "@web/common/types/component.types";
import {
  getDayjsByTimeValue,
  type MapToBackendResult,
  tryMapToBackend,
} from "@web/common/utils/datetime/web.date.util";

/** date-fns tokens for react-datepicker (display: 10.17.26). */
export const EVENT_FORM_DATE_INPUT_FORMAT = "MM.dd.yy";

export const formatEventFormDateLabel = (date: Date) =>
  dayjs(date).format("MM.DD.YY");

export const shiftTimedScheduleByDays = (
  start: Date,
  end: Date,
  dayDelta: number,
): { start: Date; end: Date } => ({
  start: dayjs(start).add(dayDelta, "day").toDate(),
  end: dayjs(end).add(dayDelta, "day").toDate(),
});

export const mergeCalendarDayWithTime = (
  day: Date,
  time: SelectOption<string>,
) => {
  const clock = getDayjsByTimeValue(time.value);
  return dayjs(day)
    .hour(clock.hour())
    .minute(clock.minute())
    .second(0)
    .millisecond(0);
};

export const timedScheduleFromDateChange = ({
  changed,
  nextDate,
  selectedStartDate,
  startTime,
  endTime,
  scheduleStart,
  scheduleEnd,
  timedOutputTimeZone,
}: {
  changed: "start" | "end";
  nextDate: Date;
  selectedStartDate: Date;
  startTime: SelectOption<string>;
  endTime: SelectOption<string>;
  scheduleStart: Date;
  scheduleEnd: Date;
  timedOutputTimeZone?: string;
}): MapToBackendResult => {
  if (changed === "start") {
    // A start date moves the whole span, so the end rides along. A same-day
    // pick shifts by zero, which is already the identity.
    const dayDelta = dayjs(nextDate)
      .startOf("day")
      .diff(dayjs(selectedStartDate).startOf("day"), "day");
    const shifted = shiftTimedScheduleByDays(
      scheduleStart,
      scheduleEnd,
      dayDelta,
    );
    return tryMapToBackend(
      {
        startDate: shifted.start,
        startTime,
        endDate: shifted.end,
        endTime,
        isAllDay: false,
      },
      timedOutputTimeZone,
    );
  }

  const nextEnd = mergeCalendarDayWithTime(nextDate, endTime).toDate();
  return tryMapToBackend(
    {
      startDate: selectedStartDate,
      startTime,
      endDate: nextEnd,
      endTime,
      isAllDay: false,
    },
    timedOutputTimeZone,
  );
};
