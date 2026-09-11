import { type ForwardedRef, forwardRef, memo } from "react";
import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import { type CalendarCardIdentity } from "@web/calendars/useCalendarLookup";
import { type GridEvent } from "@web/common/types/web.event.types";
import { AllDayEventCard } from "@web/grid/components/AllDayEventCard";
import { applyHiddenEventStripWidth } from "@web/grid/grid.constants";
import { getAllDayEventPosition } from "@web/grid/layout/event.position";
import { type Measurements_Grid } from "@web/views/Week/hooks/grid/useGridLayout";
import { type WeekProps } from "@web/views/Week/hooks/useWeek";

interface Props {
  calendarIdentity?: CalendarCardIdentity | null;
  event: GridEvent;
  focusColor?: string | null;
  interactionAttributes?: Record<string, string | undefined>;
  isHidden?: boolean;
  isPlaceholder: boolean;
  measurements: Measurements_Grid;
  weekDays: WeekProps["component"]["weekDays"];
  onKeyDown?: (event: GridEvent) => void;
}

const AllDayEventBase = (
  {
    calendarIdentity = null,
    event,
    focusColor = null,
    interactionAttributes,
    isHidden = false,
    isPlaceholder,
    measurements,
    weekDays,
    onKeyDown,
  }: Props,
  ref: ForwardedRef<HTMLDivElement>,
) => {
  // Positions map to the rendered day columns, which may be a window of the
  // week rather than all 7 days.
  const visibleDates = weekDays.map((date) => ({
    date,
    key: date.format(YEAR_MONTH_DAY_FORMAT),
  }));
  const position = getAllDayEventPosition(event, {
    isDraft: false,
    measurements,
    visibleDates,
  });
  const displayPosition = applyHiddenEventStripWidth(position, isHidden);

  return (
    <AllDayEventCard
      calendarIdentity={calendarIdentity}
      event={event}
      focusColor={focusColor}
      interactionAttributes={interactionAttributes}
      isHidden={isHidden}
      isPlaceholder={isPlaceholder}
      onEventKeyDown={onKeyDown}
      position={displayPosition}
      ref={ref}
    />
  );
};

const AllDayEvent = forwardRef(AllDayEventBase);

export const AllDayEventMemo = memo(AllDayEvent, (prev, next) => {
  return (
    prev.calendarIdentity === next.calendarIdentity &&
    prev.event === next.event &&
    prev.focusColor === next.focusColor &&
    prev.interactionAttributes === next.interactionAttributes &&
    prev.isHidden === next.isHidden &&
    prev.isPlaceholder === next.isPlaceholder &&
    prev.measurements === next.measurements &&
    // The visible window can move without the event or measurements changing
    prev.weekDays === next.weekDays
  );
});
