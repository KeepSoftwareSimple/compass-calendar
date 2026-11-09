import { useMemo } from "react";
import dayjs from "@core/util/date/dayjs";
import { EventPastePreviewAllDayLayer } from "@web/events/paste-preview/EventPastePreviewLayer";
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
  queryEndOfView: WeekProps["query"]["endOfView"];
  queryStartOfView: WeekProps["query"]["startOfView"];
  weekDays: WeekProps["component"]["weekDays"];
}

export const AllDayPastePreview = ({
  measurements,
  queryEndOfView,
  queryStartOfView,
  weekDays,
}: Props) => {
  const { allDayEvents, timedEvents } = useWeekEventViewModel({
    startOfView: queryStartOfView,
    endOfView: queryEndOfView,
  });
  const activeDayKeys = useEventJumpStore(selectEventJumpActiveDayKeys);
  const pointerDraftDateKey = useEventJumpStore(selectPointerDraftDateKey);
  const visibleDates = useWeekVisibleDates(weekDays);

  const fallbackDay = useMemo(() => {
    const now = dayjs().tz(getEffectiveTimeZone());
    const focusedColumn = quickTimeFocusedColumnDay(
      pointerDraftDateKey,
      activeDayKeys,
    );
    const focusedEvent = weekEventTargeting.getFocusedGridEventTarget();
    return quickTimeTargetDay(
      queryStartOfView,
      queryEndOfView,
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
    pointerDraftDateKey,
    queryEndOfView,
    queryStartOfView,
    timedEvents,
  ]);

  return (
    <EventPastePreviewAllDayLayer
      fallbackDay={fallbackDay}
      measurements={measurements}
      visibleDates={visibleDates}
    />
  );
};
