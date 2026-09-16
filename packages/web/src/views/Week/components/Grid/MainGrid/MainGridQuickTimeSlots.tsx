import { useMemo } from "react";
import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import dayjs from "@core/util/date/dayjs";
import { useWeekEventViewModel } from "@web/events/queries/useWeekEventsQuery";
import { weekEventTargeting } from "@web/grid/interaction/view-event-registry";
import { type GridVisibleDate } from "@web/grid/types/grid.types";
import { QuickTimeSlots } from "@web/shortcuts/quick-time/QuickTimeSlots";
import {
  buildQuickTimeSlots,
  quickTimeDayFromEventStart,
  quickTimeFocusedColumnDay,
  quickTimeTargetDay,
  timedEventsToBusyIntervals,
} from "@web/shortcuts/quick-time/quick-time.util";
import {
  selectEventJumpActive,
  selectEventJumpActiveDayKeys,
  selectPointerDraftDateKey,
  useEventJumpStore,
} from "@web/shortcuts/shift-hint/event-jump.store";
import { getEffectiveTimeZone } from "@web/timezone/effective-timezone.store";
import { type Measurements_Grid } from "@web/views/Week/hooks/grid/useGridLayout";
import { type WeekProps } from "@web/views/Week/hooks/useWeek";

interface Props {
  measurements: Measurements_Grid;
  weekProps: WeekProps;
}

/**
 * Week-grid host for the quick-time placeholders. Sources events from the same
 * cached week query MainGridEvents reads, the way GridBusyPeriods sources
 * its own availability query, so no new props thread through the grid.
 * The chips follow the focused column (jump-selected day, parked click, or
 * focused event) so they preview where a typed time would land.
 */
export const MainGridQuickTimeSlots = ({ measurements, weekProps }: Props) => {
  const { component } = weekProps;
  // Same args as MainGridEvents so this shares that query's cache entry rather
  // than opening a second one.
  const { allDayEvents, timedEvents } = useWeekEventViewModel({
    startOfView: weekProps.query.startOfView,
    endOfView: weekProps.query.endOfView,
  });
  const isJumpActive = useEventJumpStore(selectEventJumpActive);
  const activeDayKeys = useEventJumpStore(selectEventJumpActiveDayKeys);
  const pointerDraftDateKey = useEventJumpStore(selectPointerDraftDateKey);
  const visibleDates: GridVisibleDate[] = useMemo(
    () =>
      component.weekDays.map((date) => ({
        date,
        key: date.format(YEAR_MONTH_DAY_FORMAT),
      })),
    [component.weekDays],
  );

  const slots = useMemo(() => {
    const now = dayjs().tz(getEffectiveTimeZone());
    const focusedColumn = quickTimeFocusedColumnDay(
      pointerDraftDateKey,
      activeDayKeys,
    );
    const focusedEvent = isJumpActive
      ? weekEventTargeting.getFocusedGridEventTarget()
      : null;
    const targetDay = quickTimeTargetDay(
      component.startOfView,
      component.endOfView,
      now,
      focusedColumn ??
        quickTimeDayFromEventStart(
          focusedEvent
            ? [...allDayEvents, ...timedEvents].find(
                (event) => event._id === focusedEvent.eventId,
              )?.startDate
            : undefined,
        ),
    );
    return buildQuickTimeSlots({
      busy: timedEventsToBusyIntervals(timedEvents),
      now,
      targetDay,
    });
  }, [
    activeDayKeys,
    allDayEvents,
    component.endOfView,
    component.startOfView,
    isJumpActive,
    pointerDraftDateKey,
    timedEvents,
  ]);

  return (
    <QuickTimeSlots
      measurements={measurements}
      slots={slots}
      visibleDates={visibleDates}
    />
  );
};
