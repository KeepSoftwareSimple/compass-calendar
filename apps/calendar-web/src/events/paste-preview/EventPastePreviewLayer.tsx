import { type FC } from "react";
import { type Dayjs } from "@core/util/date/dayjs";
import { useCalendarLookup } from "@web/calendars/useCalendarLookup";
import {
  EVENT_PASTE_PREVIEW_ID,
  useEventPastePreviewGridEvent,
} from "@web/events/hooks/useEventPastePreviewGridEvent";
import { GridAllDayEventMemo } from "@web/grid/components/GridAllDayEvent";
import { GridTimedEvent } from "@web/grid/components/GridTimedEvent";
import { resolveGridEventCardChrome } from "@web/grid/grid-event-card-chrome";
import { getWeekInteractionTargetAttributes } from "@web/grid/interaction/view-event-registry";
import {
  type GridMeasurements,
  type GridVisibleDate,
} from "@web/grid/types/grid.types";

interface Props {
  columnIndex?: number;
  fallbackDay: Dayjs;
  measurements: GridMeasurements;
  visibleDates: GridVisibleDate[];
}

const usePastePreview = (fallbackDay: Dayjs) =>
  useEventPastePreviewGridEvent(fallbackDay);

/** Timed-track ghost for paste preview. */
export const EventPastePreviewTimedLayer: FC<Props> = ({
  columnIndex,
  fallbackDay,
  measurements,
  visibleDates,
}) => {
  const preview = usePastePreview(fallbackDay);
  const calendarLookup = useCalendarLookup();

  if (!preview || preview.isAllDay) return null;

  const interactionAttributes = {
    ...getWeekInteractionTargetAttributes({
      eventId: EVENT_PASTE_PREVIEW_ID,
      eventType: "timed",
    }),
    "data-event-paste-preview": "",
  };
  const { focusColor } = resolveGridEventCardChrome(
    calendarLookup,
    preview,
    new Set(),
  );

  return (
    <GridTimedEvent
      columnIndex={columnIndex}
      displayMode="draft"
      event={preview}
      focusColor={focusColor}
      interactionAttributes={interactionAttributes}
      isSelected={false}
      measurements={measurements}
      visibleDates={visibleDates}
    />
  );
};

/** All-day row ghost for paste preview. */
export const EventPastePreviewAllDayLayer: FC<Omit<Props, "columnIndex">> = ({
  fallbackDay,
  measurements,
  visibleDates,
}) => {
  const preview = usePastePreview(fallbackDay);

  if (!preview?.isAllDay) return null;

  const interactionAttributes = {
    ...getWeekInteractionTargetAttributes({
      eventId: EVENT_PASTE_PREVIEW_ID,
      eventType: "all-day",
    }),
    "data-event-paste-preview": "",
  };
  return (
    <GridAllDayEventMemo
      event={preview}
      interactionAttributes={interactionAttributes}
      isPlaceholder={false}
      isSelected={false}
      measurements={measurements}
      visibleDates={visibleDates}
    />
  );
};
