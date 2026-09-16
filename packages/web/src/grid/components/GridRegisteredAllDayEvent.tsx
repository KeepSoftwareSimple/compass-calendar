import { type CalendarCardIdentity } from "@web/calendars/useCalendarLookup";
import { type GridEvent } from "@web/common/types/web.event.types";
import { GridAllDayEventMemo } from "@web/grid/components/GridAllDayEvent";
import { useGridEventCardInteraction } from "@web/grid/interaction/use-grid-event-card-interaction";
import { type CalendarGridView } from "@web/grid/interaction/view-event-registry";
import {
  type GridMeasurements,
  type GridVisibleDate,
} from "@web/grid/types/grid.types";

interface GridRegisteredAllDayEventProps {
  calendarIdentity?: CalendarCardIdentity | null;
  columnIndex?: number;
  event: GridEvent;
  focusColor?: string | null;
  isActiveDraft?: boolean;
  isDraft?: boolean;
  isHidden?: boolean;
  isPlaceholder: boolean;
  isReadOnly: boolean;
  measurements: GridMeasurements;
  onEventKeyDown: (event: GridEvent) => void;
  view: CalendarGridView;
  visibleDates: GridVisibleDate[];
}

export const GridRegisteredAllDayEvent = ({
  calendarIdentity = null,
  columnIndex,
  event,
  focusColor = null,
  isActiveDraft = false,
  isDraft = false,
  isHidden = false,
  isPlaceholder,
  isReadOnly,
  measurements,
  onEventKeyDown,
  view,
  visibleDates,
}: GridRegisteredAllDayEventProps) => {
  const { interactionAttributes, registrationRef } =
    useGridEventCardInteraction({
      view,
      eventId: event._id,
      eventType: "all-day",
      isHidden,
      isPlaceholder,
      isReadOnly,
    });

  return (
    <GridAllDayEventMemo
      calendarIdentity={calendarIdentity}
      columnIndex={columnIndex}
      event={event}
      focusColor={focusColor}
      interactionAttributes={interactionAttributes}
      isActiveDraft={isActiveDraft}
      isDraft={isDraft}
      isHidden={isHidden}
      isPlaceholder={isPlaceholder}
      measurements={measurements}
      onEventKeyDown={onEventKeyDown}
      ref={registrationRef}
      visibleDates={visibleDates}
    />
  );
};
