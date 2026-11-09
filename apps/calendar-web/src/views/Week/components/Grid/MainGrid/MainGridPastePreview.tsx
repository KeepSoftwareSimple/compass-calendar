import { useMemo } from "react";
import dayjs from "@core/util/date/dayjs";
import { EventPastePreviewTimedLayer } from "@web/events/paste-preview/EventPastePreviewLayer";
import { useWeekEventViewModel } from "@web/events/queries/useWeekEventsQuery";
import { weekEventTargeting } from "@web/grid/interaction/view-event-registry";
import {
  quickTimeDayFromEventStart,
  quickTimeFocusedColumnDay,
  quickTimeTargetDay,
} from "@web/shortcuts/quick-time/quick-time.util";
import {
  selectEventJumpActiveDayKeys,
  selectPointerDraftDateKey,
  useEventJumpStore,
} from "@web/shortcuts/shift-hint/event-jump.store";
import { getEffectiveTimeZone } from "@web/timezone/effective-timezone.store";
import { type Measurements_Grid } from "@web/views/Week/hooks/grid/useGridLayout";
import { useWeekVisibleDates } from "@web/views/Week/hooks/grid/useWeekVisibleDates";
import { type WeekProps } from "@web/views/Week/hooks/useWeek";

interface Props {
  measurements: Measurements_Grid;
  weekProps: WeekProps;
}

export const MainGridPastePreview = ({ measurements, weekProps }: Props) => {
  const { component } = weekProps;
  const { allDayEvents, timedEvents } = useWeekEventViewModel({
    startOfView: weekProps.query.startOfView,
    endOfView: weekProps.query.endOfView,
  });
  const activeDayKeys = useEventJumpStore(selectEventJumpActiveDayKeys);
  const pointerDraftDateKey = useEventJumpStore(selectPointerDraftDateKey);
  const visibleDates = useWeekVisibleDates(component.weekDays);

  const fallbackDay = useMemo(() => {
    const now = dayjs().tz(getEffectiveTimeZone());
    const focusedColumn = quickTimeFocusedColumnDay(
      pointerDraftDateKey,
      activeDayKeys,
    );
    const focusedEvent = weekEventTargeting.getFocusedGridEventTarget();
    return quickTimeTargetDay(
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
  }, [
    activeDayKeys,
    allDayEvents,
    component.endOfView,
    component.startOfView,
    pointerDraftDateKey,
    timedEvents,
  ]);

  return (
    <EventPastePreviewTimedLayer
      fallbackDay={fallbackDay}
      measurements={measurements}
      visibleDates={visibleDates}
    />
  );
};
