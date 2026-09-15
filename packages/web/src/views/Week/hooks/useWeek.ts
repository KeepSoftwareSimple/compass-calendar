import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef } from "react";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import { ROOT_ROUTES, ROUTE_IDS } from "@web/common/constants/routes";
import { toUTCOffset } from "@web/common/utils/datetime/web.date.util";
import { weekEventsQueryOptions } from "@web/events/queries/event.query.options";
import { usePrefetchAdjacentEvents } from "@web/events/queries/usePrefetchAdjacentEvents";
import { useWeekEventsQuery } from "@web/events/queries/useWeekEventsQuery";
import { viewActions } from "@web/events/stores/view.store";
import { useEffectiveTimeZone } from "@web/timezone/effective-timezone.store";
import {
  WEEK_DAY_COUNT,
  weekEventsQueryWindow,
} from "@web/views/Week/util/week-window.util";
import { type Category_View } from "@web/views/Week/week-view.types";

export type WeekNavigationSource = "manual" | "drag-to-edge" | "day-shift";

const DATE_FORMAT = dayjs.DateFormat.YEAR_MONTH_DAY_FORMAT;

export const useWeek = (
  today: Dayjs,
  visibleDayCount: number = WEEK_DAY_COUNT,
) => {
  // The URL date is the first visible day, so custom windows survive refresh
  // and can cross calendar-week boundaries. Memoize from the date string
  // because `today` is a fresh Dayjs instance on every render.
  const navigate = useNavigate();
  const params = useParams({
    from: ROUTE_IDS.WEEK_DATE,
    shouldThrow: false,
  });
  // Bare /week has no dateString. Default to today when only one day is
  // visible, otherwise the week-aligned start. Once navigation writes a
  // dateString, that drives the anchor at every width.
  const timeZone = useEffectiveTimeZone();
  const defaultAnchorDate =
    visibleDayCount === 1 ? today : today.startOf("week");
  const anchorDateString =
    params?.dateString ?? defaultAnchorDate.format(DATE_FORMAT);
  const anchor = useMemo(
    () => dayjs.tz(anchorDateString, timeZone),
    [anchorDateString, timeZone],
  );
  const setAnchor = useCallback(
    (date: Dayjs) =>
      navigate({
        to: ROOT_ROUTES.WEEK_DATE,
        params: { dateString: date.format(DATE_FORMAT) },
      }),
    [navigate],
  );
  const navigationSourceRef = useRef<WeekNavigationSource>("manual");

  const start = useMemo(() => anchor.startOf("day"), [anchor]);
  const end = useMemo(
    () => start.add(visibleDayCount - 1, "day").endOf("day"),
    [start, visibleDayCount],
  );
  // Fetch window is always WEEK_DAY_COUNT days from the anchor so resize-driven
  // column changes reuse the same cache entry; display still clips to weekDays.
  const queryEnd = useMemo(
    () => weekEventsQueryWindow(anchor).endOfView,
    [anchor],
  );

  const week = useMemo(() => start.week(), [start]);

  const isCurrentWeek = today.isBetween(start, end, "day", "[]");

  const weekDays = useMemo(
    () =>
      Array.from({ length: visibleDayCount }, (_, index) =>
        start.add(index, "day"),
      ),
    [start, visibleDayCount],
  );

  const weekQuery = useWeekEventsQuery({
    startOfView: start,
    endOfView: queryEnd,
  });

  // Warm the previous and next paged windows (J/K) using 7-day read keys.
  // Defer until the current range has settled so first paint is not competing
  // with adjacent Sync drains.
  const previousStart = useMemo(
    () => start.subtract(visibleDayCount, "day"),
    [start, visibleDayCount],
  );
  const nextStart = useMemo(
    () => start.add(visibleDayCount, "day"),
    [start, visibleDayCount],
  );
  usePrefetchAdjacentEvents(
    weekEventsQueryOptions,
    {
      startDate: toUTCOffset(previousStart),
      endDate: toUTCOffset(
        previousStart.add(WEEK_DAY_COUNT, "day").startOf("day"),
      ),
      calendarIds: weekQuery.calendarIds,
    },
    {
      startDate: toUTCOffset(nextStart),
      endDate: toUTCOffset(nextStart.add(WEEK_DAY_COUNT, "day").startOf("day")),
      calendarIds: weekQuery.calendarIds,
    },
    weekQuery.isSuccess,
  );

  useEffect(() => {
    viewActions.updateDates({
      start: start.format(),
      end: end.format(),
    });
  }, [end, start]);

  const goToDate = useCallback(
    (date: Dayjs) => {
      navigationSourceRef.current = "manual";
      setAnchor(date);
    },
    [setAnchor],
  );

  const pageWindow = useCallback(
    (direction: 1 | -1, source: WeekNavigationSource) => {
      navigationSourceRef.current = source;
      setAnchor(start.add(direction * visibleDayCount, "day"));
    },
    [setAnchor, start, visibleDayCount],
  );

  const incrementWeek = useCallback(
    (source: WeekNavigationSource = "manual") => pageWindow(1, source),
    [pageWindow],
  );

  const decrementWeek = useCallback(
    (source: WeekNavigationSource = "manual") => pageWindow(-1, source),
    [pageWindow],
  );

  const shiftViewByDay = useCallback(
    (direction: 1 | -1) => {
      navigationSourceRef.current = "day-shift";
      setAnchor(start.add(direction, "day"));
    },
    [setAnchor, start],
  );

  const goToToday = useCallback(() => {
    const navigationSource = navigationSourceRef.current;
    navigationSourceRef.current = "manual";
    if (!isCurrentWeek) {
      const todayWindowStart = today.startOf("week");
      const shiftedWindowOffset =
        navigationSource === "day-shift"
          ? start.diff(start.startOf("week"), "day")
          : 0;
      setAnchor(todayWindowStart.add(shiftedWindowOffset, "day"));
    }
  }, [isCurrentWeek, setAnchor, start, today]);

  const getLastNavigationSource = useCallback(
    () => navigationSourceRef.current,
    [],
  );

  const componentProps = useMemo(
    () => ({
      category: (isCurrentWeek ? "current" : "pastFuture") as Category_View,
      endOfView: end,
      isCurrentWeek,
      startOfView: start,
      week,
      weekDays,
    }),
    [isCurrentWeek, end, start, week, weekDays],
  );

  const queryProps = useMemo(
    () => ({
      endOfView: queryEnd,
      startOfView: start,
    }),
    [queryEnd, start],
  );

  const stateProps = useMemo(() => ({ goToDate }), [goToDate]);

  const utilProps = useMemo(
    () => ({
      decrementWeek,
      getLastNavigationSource,
      goToToday,
      incrementWeek,
      shiftViewByDay,
    }),
    [
      decrementWeek,
      getLastNavigationSource,
      goToToday,
      incrementWeek,
      shiftViewByDay,
    ],
  );

  const weekProps = useMemo(
    () => ({
      component: componentProps,
      query: queryProps,
      state: stateProps,
      util: utilProps,
    }),
    [componentProps, queryProps, stateProps, utilProps],
  );

  return weekProps;
};

export type WeekProps = ReturnType<typeof useWeek>;
