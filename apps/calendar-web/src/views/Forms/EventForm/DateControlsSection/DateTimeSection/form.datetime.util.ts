import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import dayjs from "@core/util/date/dayjs";
import { getTimeOptionByValue } from "@web/common/utils/datetime/web.date.util";

export const getFormDates = (startDate: string, endDate: string) => {
  const start = dayjs(startDate);
  const startDateFormatted = start.format(YEAR_MONTH_DAY_FORMAT);
  const startTime = getTimeOptionByValue(start);

  const end = dayjs(endDate);
  const isOneDay = startDateFormatted === end.format(YEAR_MONTH_DAY_FORMAT);
  const displayEndDate = isOneDay
    ? startDateFormatted
    : end.subtract(1, "day").format(YEAR_MONTH_DAY_FORMAT);
  const _endDate = isOneDay ? start.toDate() : end.toDate();
  const endTime = getTimeOptionByValue(end);

  return {
    startDate: start.toDate(),
    startTime,
    endDate: _endDate,
    displayEndDate,
    endTime,
  };
};
