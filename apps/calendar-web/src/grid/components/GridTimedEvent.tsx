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
import {
  type GridMeasurements,
  type GridVisibleDate,
} from "@web/grid/types/grid.types";

interface Props {
  calendarIdentity?: CalendarCardIdentity | null;
  columnIndex?: number;
  deckLayout?: TimedDeckLayout | null;
  displayMode: GridEventDisplayMode;
  event: GridEventEntity;
  focusColor?: string | null;
  interactionAttributes?: Record<string, string | undefined>;
  isActiveDraft?: boolean;
  isHidden?: boolean;
  isSelected?: boolean;
  measurements: GridMeasurements;
  motionMode?: GridEventMotionMode;
  onEventKeyDown?: (event: GridEventEntity) => void;
  positionAsDraft?: boolean;
  visibleDates: GridVisibleDate[];
}

type GridEventDisplayMode = "draft" | "placeholder" | "saved";
type GridEventMotionMode = "dragging" | "idle" | "resizing";

const GridTimedEventBase = (
  {
    calendarIdentity = null,
    columnIndex,
    deckLayout = null,
    displayMode,
    event,
    focusColor = null,
    interactionAttributes,
    isActiveDraft = false,
    isHidden = false,
    isSelected = false,
    measurements,
    motionMode = "idle",
    onEventKeyDown,
    positionAsDraft = false,
    visibleDates,
  }: Props,
  ref: ForwardedRef<HTMLDivElement>,
) => {
  const isDraft = displayMode === "draft";
  const isDragging = motionMode === "dragging";
  const isResizing = motionMode === "resizing";
  const isDeck = Boolean(deckLayout);
  const [isFocused, setIsFocused] = useState(false);

  const shouldUseDraftSizing = isDraft && !deckLayout;
  const basePosition = getTimedEventPosition(event, {
    columnIndex,
    isDraft: shouldUseDraftSizing || positionAsDraft,
    measurements,
    visibleDates,
  });
  const position = shouldUseDraftSizing
    ? basePosition
    : applyTimedEventDisplayPosition(basePosition, deckLayout, isHidden);

  const shouldFloatAboveDeck =
    isDragging || isResizing || ((isDraft || isActiveDraft) && !isDeck);
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
      isSelected={isSelected || isActiveDraft}
      motionMode={motionMode}
      onEventKeyDown={onEventKeyDown}
      position={{ ...position, zIndex }}
      ref={ref}
    />
  );
};

export const GridTimedEvent = forwardRef(GridTimedEventBase);
export const GridTimedEventMemo = memo(GridTimedEvent, (prev, next) => {
  return (
    prev.calendarIdentity === next.calendarIdentity &&
    prev.columnIndex === next.columnIndex &&
    prev.displayMode === next.displayMode &&
    prev.deckLayout === next.deckLayout &&
    prev.event === next.event &&
    prev.focusColor === next.focusColor &&
    prev.interactionAttributes === next.interactionAttributes &&
    prev.isActiveDraft === next.isActiveDraft &&
    prev.isHidden === next.isHidden &&
    prev.isSelected === next.isSelected &&
    prev.measurements === next.measurements &&
    prev.motionMode === next.motionMode &&
    prev.positionAsDraft === next.positionAsDraft &&
    prev.visibleDates === next.visibleDates
  );
});
