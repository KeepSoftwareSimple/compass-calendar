import { useMemo } from "react";
import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import { type Dayjs } from "@core/util/date/dayjs";
import { type GridVisibleDate } from "@web/grid/types/grid.types";

/**
 * The week's day columns as grid columns: one {@link GridVisibleDate} per day,
 * keyed by calendar date, memoized while `weekDays` is stable. Every week layer
 * (events, all-day, busy periods, quick-time chips, drafts) indexes columns by
 * that key, so they all derive it here rather than each repeating the mapping.
 */
export const useWeekVisibleDates = (weekDays: Dayjs[]): GridVisibleDate[] =>
  useMemo(
    () =>
      weekDays.map((date) => ({
        date,
        key: date.format(YEAR_MONTH_DAY_FORMAT),
      })),
    [weekDays],
  );
