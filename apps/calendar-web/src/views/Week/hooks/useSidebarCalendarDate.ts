import { useCallback, useEffect, useState } from "react";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";

interface SidebarCalendarDateArgs {
  currentDate: Dayjs;
  today: Dayjs;
  viewEnd: Dayjs;
  viewStart: Dayjs;
}

interface UseSidebarCalendarDateArgs {
  goToDate: (date: Dayjs) => void;
  today: Dayjs;
  viewEnd: Dayjs;
  viewStart: Dayjs;
}

const dateFormat = dayjs.DateFormat.YEAR_MONTH_DAY_FORMAT;

function resolveSidebarCalendarDate({
  currentDate,
  today,
  viewEnd,
  viewStart,
}: SidebarCalendarDateArgs) {
  if (currentDate.isBetween(viewStart, viewEnd, "day", "[]")) {
    return currentDate;
  }

  if (today.isBetween(viewStart, viewEnd, "day", "[]")) {
    return today;
  }

  return viewStart;
}

export function useSidebarCalendarDate({
  goToDate,
  today,
  viewEnd,
  viewStart,
}: UseSidebarCalendarDateArgs) {
  const [calendarDate, setCalendarDate] = useState(() =>
    resolveSidebarCalendarDate({
      currentDate: today,
      today,
      viewEnd,
      viewStart,
    }),
  );

  const todayKey = today.format(dateFormat);
  const viewEndKey = viewEnd.format(dateFormat);
  const viewStartKey = viewStart.format(dateFormat);

  useEffect(() => {
    const nextToday = dayjs(todayKey, dateFormat);
    const nextViewEnd = dayjs(viewEndKey, dateFormat);
    const nextViewStart = dayjs(viewStartKey, dateFormat);

    setCalendarDate((currentDate) =>
      resolveSidebarCalendarDate({
        currentDate,
        today: nextToday,
        viewEnd: nextViewEnd,
        viewStart: nextViewStart,
      }),
    );
  }, [todayKey, viewEndKey, viewStartKey]);

  const goToDateFromSidebar = useCallback(
    (date: Dayjs) => {
      setCalendarDate(date);
      // Anchor the view on the picked date so it stays visible even when the
      // window shows fewer than 7 days.
      goToDate(date);
    },
    [goToDate],
  );

  return { calendarDate, goToDateFromSidebar };
}
