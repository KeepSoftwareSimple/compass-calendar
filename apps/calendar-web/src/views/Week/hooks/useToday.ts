import { useMemo, useRef } from "react";
import { type Dayjs } from "@core/util/date/dayjs";
import { useMinuteTick } from "@web/common/hooks/useMinuteTick";
import { useEffectiveTimeZone } from "@web/timezone/effective-timezone.store";

// A fresh dayjs() every render permanently invalidates every memo/comparator
// downstream that takes `today` as a dependency (weekProps, grid layout,
// etc.), since it never equals the previous render's instance even though
// the calendar day hasn't changed. Keep the same reference across renders
// within a day; only swap it (checked once a minute, via the shared tick)
// when the day rolls over or the effective timezone changes.
export const useToday = () => {
  const tick = useMinuteTick();
  const timeZone = useEffectiveTimeZone();
  const zonedTick = useMemo(() => tick.tz(timeZone), [tick, timeZone]);
  const todayRef = useRef<Dayjs>(zonedTick);
  const timeZoneRef = useRef(timeZone);

  if (
    timeZoneRef.current !== timeZone ||
    !todayRef.current.isSame(zonedTick, "day")
  ) {
    todayRef.current = zonedTick.startOf("day");
    timeZoneRef.current = timeZone;
  }

  const today = todayRef.current;
  const todayIndex = today.get("day");

  return { today, todayIndex };
};
