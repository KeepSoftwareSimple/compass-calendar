import { useContext, useMemo } from "react";
import dayjs from "@core/util/date/dayjs";
import { useEffectiveTimeZone } from "@web/timezone/effective-timezone.store";
import { DateNavigationContext } from "@web/views/Day/context/DateNavigationContext";

export function useDateInView(): dayjs.Dayjs {
  const context = useContext(DateNavigationContext);
  const dateInView = context?.dateInView;
  const timeZone = useEffectiveTimeZone();

  return useMemo(
    () => dateInView ?? dayjs().tz(timeZone),
    [dateInView, timeZone],
  );
}
