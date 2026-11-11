import { type ForwardedRef, forwardRef, memo, useState } from "react";
import { type CalendarCardIdentity } from "@web/calendars/useCalendarLookup";
import { ZIndex } from "@web/common/constants/web.constants";
import { type GridEvent } from "@web/common/types/web.event.types";
import { type GridGuestResponseState } from "@web/events/attendee-rsvp";
import { AllDayEventCard } from "@web/grid/components/AllDayEventCard";
import { withGridEventKeyboardFocusZIndex } from "@web/grid/components/grid-event-focus-z-index";
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
  guestResponse?: GridGuestResponseState | null;
  interactionAttributes?: Record<string, string | undefined>;
  isActiveDraft?: boolean;
  isDraft?: boolean;
  isHidden?: boolean;
  isPlaceholder: boolean;
  isSelected?: boolean;
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
    guestResponse = null,
    interactionAttributes,
    isActiveDraft = false,
    isDraft = false,
    isHidden = false,
    isPlaceholder,
    isSelected = false,
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
  const stackZIndex = isActiveDraft ? ZIndex.MAX : displayPosition.zIndex;
  const [isFocused, setIsFocused] = useState(false);
  const positionWithStack = {
    ...displayPosition,
    zIndex: withGridEventKeyboardFocusZIndex(
      stackZIndex ?? ZIndex.LAYER_1,
      isFocused && !isActiveDraft,
    ),
  };

  return (
    <AllDayEventCard
      calendarIdentity={calendarIdentity}
      event={event}
      focusColor={focusColor}
      guestResponse={guestResponse}
      interactionAttributes={interactionAttributes}
      isHidden={isHidden}
      isPlaceholder={isPlaceholder}
      isSelected={isSelected || isActiveDraft}
      onBlur={() => setIsFocused(false)}
      onEventKeyDown={onEventKeyDown}
      onFocus={() => setIsFocused(true)}
      position={positionWithStack}
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
    prev.guestResponse === next.guestResponse &&
    prev.interactionAttributes === next.interactionAttributes &&
    prev.isActiveDraft === next.isActiveDraft &&
    prev.isDraft === next.isDraft &&
    prev.isHidden === next.isHidden &&
    prev.isPlaceholder === next.isPlaceholder &&
    prev.isSelected === next.isSelected &&
    prev.measurements === next.measurements &&
    prev.visibleDates === next.visibleDates
  );
});
