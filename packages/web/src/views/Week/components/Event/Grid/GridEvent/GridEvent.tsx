import { type ForwardedRef, forwardRef, memo, useState } from "react";
import { type CalendarCardIdentity } from "@web/calendars/useCalendarLookup";
import { ZIndex } from "@web/common/constants/web.constants";
import { type GridEvent as GridEventEntity } from "@web/common/types/web.event.types";
import { TimedEventCard } from "@web/grid/components/TimedEventCard";
import { getTimedEventPosition } from "@web/grid/layout/event.position";
import {
  applyTimedEventDisplayPosition,
  type TimedDeckLayout,
  timedDeckBoxShadow,
} from "@web/grid/layout/timed-deck.layout";
import { type GridVisibleDate } from "@web/grid/types/grid.types";
import { type Measurements_Grid } from "@web/views/Week/hooks/grid/useGridLayout";

interface Props {
  calendarIdentity?: CalendarCardIdentity | null;
  deckLayout?: TimedDeckLayout | null;
  displayMode: GridEventDisplayMode;
  event: GridEventEntity;
  focusColor?: string | null;
  interactionAttributes?: Record<string, string | undefined>;
  isHidden?: boolean;
  measurements: Measurements_Grid;
  motionMode?: GridEventMotionMode;
  onEventKeyDown?: (event: GridEventEntity) => void;
  visibleDates: GridVisibleDate[];
}

type GridEventDisplayMode = "draft" | "placeholder" | "saved";
type GridEventMotionMode = "dragging" | "idle" | "resizing";

const GridEventBase = (
  {
    calendarIdentity = null,
    deckLayout = null,
    displayMode,
    event: _event,
    focusColor = null,
    interactionAttributes,
    isHidden = false,
    measurements,
    motionMode = "idle",
    onEventKeyDown,
    visibleDates,
  }: Props,
  ref: ForwardedRef<HTMLDivElement>,
) => {
  const isDraft = displayMode === "draft";
  const isDragging = motionMode === "dragging";
  const isResizing = motionMode === "resizing";
  const event = _event;
  const isDeck = Boolean(deckLayout);
  const [isFocused, setIsFocused] = useState(false);

  const shouldUseDraftSizing = isDraft && !deckLayout;
  const basePosition = getTimedEventPosition(event, {
    isDraft: shouldUseDraftSizing,
    measurements,
    visibleDates,
  });
  const position = shouldUseDraftSizing
    ? basePosition
    : applyTimedEventDisplayPosition(basePosition, deckLayout, isHidden);

  const shouldFloatAboveDeck = isDragging || isResizing || (isDraft && !isDeck);
  const zIndex = shouldFloatAboveDeck
    ? ZIndex.MAX
    : (position.zIndex ?? ZIndex.LAYER_1);

  const deckBoxShadow = isDeck ? timedDeckBoxShadow(isFocused) : undefined;
  return (
    <TimedEventCard
      onBlur={isDeck ? () => setIsFocused(false) : undefined}
      boxShadow={deckBoxShadow}
      calendarIdentity={calendarIdentity}
      displayMode={displayMode}
      event={event}
      focusColor={focusColor}
      onFocus={isDeck ? () => setIsFocused(true) : undefined}
      interactionAttributes={interactionAttributes}
      isHidden={isHidden}
      motionMode={motionMode}
      onEventKeyDown={onEventKeyDown}
      position={{ ...position, zIndex }}
      ref={ref}
    />
  );
};

export const GridEvent = forwardRef(GridEventBase);
export const GridEventMemo = memo(GridEvent, (prev, next) => {
  return (
    prev.calendarIdentity === next.calendarIdentity &&
    prev.displayMode === next.displayMode &&
    prev.deckLayout === next.deckLayout &&
    prev.event === next.event &&
    prev.focusColor === next.focusColor &&
    prev.interactionAttributes === next.interactionAttributes &&
    prev.isHidden === next.isHidden &&
    prev.measurements === next.measurements &&
    prev.motionMode === next.motionMode &&
    // The visible window can move without the event or measurements changing
    prev.visibleDates === next.visibleDates
  );
});
