import { type ForwardedRef, forwardRef, memo } from "react";
import { type CalendarCardIdentity } from "@web/calendars/useCalendarLookup";
import { ZIndex } from "@web/common/constants/web.constants";
import { type GridEvent } from "@web/common/types/web.event.types";
import { AllDayEventCard } from "@web/grid/components/AllDayEventCard";
import { applyHiddenEventStripWidth } from "@web/grid/grid.constants";
import { getAllDayEventPosition } from "@web/grid/layout/event.position";
import {
  type GridMeasurements,
  type GridVisibleDate,
} from "@web/grid/types/grid.types";

interface Props {
  calendarIdentity?: CalendarCardIdentity | null;
  columnIndex?: number;
  event: GridEvent;
  focusColor?: string | null;
  interactionAttributes?: Record<string, string | undefined>;
  isActiveDraft?: boolean;
  isDraft?: boolean;
  isHidden?: boolean;
  isPlaceholder: boolean;
  measurements: GridMeasurements;
  onEventKeyDown?: (event: GridEvent) => void;
  visibleDates: GridVisibleDate[];
}

const GridAllDayEventBase = (
  {
    calendarIdentity = null,
    columnIndex,
    event,
    focusColor = null,
    interactionAttributes,
    isActiveDraft = false,
    isDraft = false,
    isHidden = false,
    isPlaceholder,
    measurements,
    onEventKeyDown,
    visibleDates,
  }: Props,
  ref: ForwardedRef<HTMLDivElement>,
) => {
  const position = getAllDayEventPosition(event, {
    columnIndex,
    isDraft,
    measurements,
    visibleDates,
  });
  const displayPosition = applyHiddenEventStripWidth(position, isHidden);
  const positionWithDraftStack = isActiveDraft
    ? { ...displayPosition, zIndex: ZIndex.MAX }
    : displayPosition;

  return (
    <AllDayEventCard
      calendarIdentity={calendarIdentity}
      event={event}
      focusColor={focusColor}
      interactionAttributes={interactionAttributes}
      isHidden={isHidden}
      isPlaceholder={isPlaceholder}
      onEventKeyDown={onEventKeyDown}
      position={positionWithDraftStack}
      ref={ref}
    />
  );
};

const GridAllDayEvent = forwardRef(GridAllDayEventBase);

export const GridAllDayEventMemo = memo(GridAllDayEvent, (prev, next) => {
  return (
    prev.calendarIdentity === next.calendarIdentity &&
    prev.columnIndex === next.columnIndex &&
    prev.event === next.event &&
    prev.focusColor === next.focusColor &&
    prev.interactionAttributes === next.interactionAttributes &&
    prev.isActiveDraft === next.isActiveDraft &&
    prev.isDraft === next.isDraft &&
    prev.isHidden === next.isHidden &&
    prev.isPlaceholder === next.isPlaceholder &&
    prev.measurements === next.measurements &&
    prev.visibleDates === next.visibleDates
  );
});
