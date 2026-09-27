import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import { type Dayjs } from "@core/util/date/dayjs";
import { type GridEvent } from "@web/common/types/web.event.types";

/**
 * Whether an all-day (or all-day-row) event's exclusive date span covers
 * `date`. Uses calendar-date prefixes so Sync UTC-midnight datetime shapes
 * and date-only schedules agree with {@link eventMatchesRange} / week
 * {@link isAllDayEventInVisibleDays}.
 */
export const isAllDayEventOnDay = (
  event: Pick<GridEvent, "startDate" | "endDate">,
  date: Dayjs,
): boolean => {
  const dayStart = date.startOf("day").format(YEAR_MONTH_DAY_FORMAT);
  const dayEnd = date
    .startOf("day")
    .add(1, "day")
    .format(YEAR_MONTH_DAY_FORMAT);
  const eventStart = event.startDate.slice(0, 10);
  const eventEnd = event.endDate.slice(0, 10);
  return eventStart < dayEnd && eventEnd > dayStart;
};
