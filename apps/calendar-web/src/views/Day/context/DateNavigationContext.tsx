import { useMatch, useNavigate } from "@tanstack/react-router";
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useMemo,
} from "react";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import { ROOT_ROUTES, ROUTE_IDS } from "@web/common/constants/routes";
import { type DayLoaderData, loadTodayData } from "@web/routers/loaders";
import { useEffectiveTimeZone } from "@web/timezone/effective-timezone.store";
import { calendarDateInEffectiveTimeZone } from "@web/timezone/in-time-zone";

interface DateNavigationContextProps extends DayLoaderData {
  navigateToDate: (date: Dayjs) => void;
  navigateToNextDay: () => void;
  navigateToPreviousDay: () => void;
  navigateToToday: () => void;
}

export const DateNavigationContext = createContext<DateNavigationContextProps>({
  ...loadTodayData(),
  navigateToDate: () => {},
  navigateToNextDay: () => {},
  navigateToPreviousDay: () => {},
  navigateToToday: () => {},
});

const dateFormat = dayjs.DateFormat.YEAR_MONTH_DAY_FORMAT;

export function DateNavigationProvider({ children }: PropsWithChildren) {
  const navigate = useNavigate();
  const routeData = useMatch({
    from: ROUTE_IDS.DAY_DATE,
    shouldThrow: false,
  })?.loaderData as DayLoaderData | undefined;

  const { dateString } = routeData ?? loadTodayData();
  const timeZone = useEffectiveTimeZone();
  const dateInView = useMemo(
    () => calendarDateInEffectiveTimeZone(dateString, timeZone),
    [dateString, timeZone],
  );

  const navigateToDate = useCallback(
    (date: dayjs.Dayjs) => {
      navigate({
        to: ROOT_ROUTES.DAY_DATE,
        params: { dateString: date.format(dateFormat) },
      });
    },
    [navigate],
  );

  const navigateToNextDay = useCallback(() => {
    const nextDate = dateInView.add(1, "day");

    navigateToDate(nextDate);
  }, [dateInView, navigateToDate]);

  const navigateToPreviousDay = useCallback(() => {
    const prevDate = dateInView.subtract(1, "day");
    navigateToDate(prevDate);
  }, [dateInView, navigateToDate]);

  const navigateToToday = useCallback(() => {
    navigateToDate(loadTodayData().dateInView);
  }, [navigateToDate]);

  const value: DateNavigationContextProps = {
    dateInView,
    dateString,
    navigateToDate,
    navigateToNextDay,
    navigateToPreviousDay,
    navigateToToday,
  };

  return (
    <DateNavigationContext.Provider value={value}>
      {children}
    </DateNavigationContext.Provider>
  );
}
