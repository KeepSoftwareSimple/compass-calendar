import { type CalendarCardIdentity } from "@web/calendars/useCalendarLookup";
import { type GridEvent } from "@web/common/types/web.event.types";
import { GridTimedEventMemo } from "@web/grid/components/GridTimedEvent";
import { useGridEventCardInteraction } from "@web/grid/interaction/use-grid-event-card-interaction";
import { type CalendarGridView } from "@web/grid/interaction/view-event-registry";
import { type TimedDeckLayout } from "@web/grid/layout/timed-deck.layout";
import {
  type GridMeasurements,
  type GridVisibleDate,
} from "@web/grid/types/grid.types";

interface GridRegisteredTimedEventProps {
  calendarIdentity?: CalendarCardIdentity | null;
  columnIndex?: number;
  deckLayout?: TimedDeckLayout | null;
  event: GridEvent;
  focusColor?: string | null;
  isActiveDraft?: boolean;
  isHidden?: boolean;
  isPlaceholder: boolean;
  isReadOnly: boolean;
  measurements: GridMeasurements;
  onEventKeyDown: (event: GridEvent) => void;
  positionAsDraft?: boolean;
  view: CalendarGridView;
  visibleDates: GridVisibleDate[];
}

export const GridRegisteredTimedEvent = ({
  calendarIdentity = null,
  columnIndex,
  deckLayout = null,
  event,
  focusColor = null,
  isActiveDraft = false,
  isHidden = false,
  isPlaceholder,
  isReadOnly,
  measurements,
  onEventKeyDown,
  positionAsDraft = false,
  view,
  visibleDates,
}: GridRegisteredTimedEventProps) => {
  const { interactionAttributes, registrationRef } =
    useGridEventCardInteraction({
      view,
      eventId: event._id,
      eventType: "timed",
      isHidden,
      isPlaceholder,
      isReadOnly,
    });

  return (
    <GridTimedEventMemo
      calendarIdentity={calendarIdentity}
      columnIndex={columnIndex}
      deckLayout={deckLayout}
      displayMode={isPlaceholder ? "placeholder" : "saved"}
      event={event}
      focusColor={focusColor}
      interactionAttributes={interactionAttributes}
      isActiveDraft={isActiveDraft}
      isHidden={isHidden}
      measurements={measurements}
      onEventKeyDown={onEventKeyDown}
      positionAsDraft={positionAsDraft}
      ref={registrationRef}
      visibleDates={visibleDates}
    />
  );
};
