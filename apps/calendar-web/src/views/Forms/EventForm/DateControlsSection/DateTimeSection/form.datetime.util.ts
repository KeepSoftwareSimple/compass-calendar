import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import dayjs from "@core/util/date/dayjs";
import { getTimeOptionByValue } from "@web/common/utils/datetime/web.date.util";
import { getEffectiveTimeZone } from "@web/timezone/effective-timezone.store";
import { inEffectiveTimeZone } from "@web/timezone/in-time-zone";

/** Wall-clock form fields follow the pinned calendar zone, not the event zone. */
export const getFormDatesForTimedInstants = (
  start: Date,
  end: Date,
  displayTimeZone: string = getEffectiveTimeZone(),
) =>
  getFormDates(
    dayjs(start).toISOString(),
    dayjs(end).toISOString(),
    displayTimeZone,
  );

export const getFormDates = (
  startDate: string,
  endDate: string,
  timeZone: string = getEffectiveTimeZone(),
) => {
  const start = inEffectiveTimeZone(startDate, timeZone);
  const startDateFormatted = start.format(YEAR_MONTH_DAY_FORMAT);
  const startTime = getTimeOptionByValue(start, timeZone);

  const end = inEffectiveTimeZone(endDate, timeZone);
  const isOneDay = startDateFormatted === end.format(YEAR_MONTH_DAY_FORMAT);
  const displayEndDate = isOneDay
    ? startDateFormatted
    : end.subtract(1, "day").format(YEAR_MONTH_DAY_FORMAT);
  const _endDate = isOneDay ? start.toDate() : end.toDate();
  const endTime = getTimeOptionByValue(end, timeZone);

  return {
    startDate: start.toDate(),
    startTime,
    endDate: _endDate,
    displayEndDate,
    endTime,
  };
};
