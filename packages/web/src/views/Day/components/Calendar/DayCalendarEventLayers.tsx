import { useMemo } from "react";
import {
  isGridEventInteractionReadOnly,
  resolveCalendarCardIdentity,
  resolveCalendarFocusColor,
  useCalendarLookup,
} from "@web/calendars/useCalendarLookup";
import {
  ID_GRID_EVENTS_ALLDAY,
  ID_GRID_EVENTS_TIMED,
} from "@web/common/constants/web.constants";
import { type GridEvent } from "@web/common/types/web.event.types";
import { type GridEventDraft } from "@web/events/event-draft.types";
import { useGridMarginLeft } from "@web/grid/grid-margin";
import { createTimedEventLayout } from "@web/grid/layout/timed-deck.layout";
import {
  type GridMeasurements,
  type GridVisibleDate,
} from "@web/grid/types/grid.types";
import {
  DayAllDayCalendarEvent,
  DayTimedCalendarEvent,
} from "./DayCalendarEventCards";
import {
  addVisibleDraftEvent,
  getCalendarEventIdSet,
  isActiveDraftEvent,
  isDraftOnlyEvent,
} from "./dayCalendarDraft.util";

interface DayAllDayEventsProps {
  getCalendarColumnIndex: (event: GridEvent) => number;
  draft: GridEventDraft | null;
  events: GridEvent[];
  measurements: GridMeasurements;
  onOpenEvent: (event: GridEvent) => void;
  savedEventIds: Set<string>;
  visibleDates: GridVisibleDate[];
}

interface DayTimedEventsProps {
  getCalendarColumnIndex: (event: GridEvent) => number;
  isDisplayedEvent: (event: GridEvent) => boolean;
  draft: GridEventDraft | null;
  events: GridEvent[];
  measurements: GridMeasurements;
  onOpenEvent: (event: GridEvent) => void;
  visibleDates: GridVisibleDate[];
}

export const DayCalendarAllDayEventsLayer = ({
  draft,
  events: allDayEvents,
  getCalendarColumnIndex,
  measurements,
  onOpenEvent,
  savedEventIds,
  visibleDates,
}: DayAllDayEventsProps) => {
  // One lookup build for the whole list (packet 08 step 5) - not per card.
  const calendarLookup = useCalendarLookup();
  const marginLeft = useGridMarginLeft();

  return (
    <div
      className="relative h-full"
      id={ID_GRID_EVENTS_ALLDAY}
      style={{
        marginLeft,
        width: `calc(100% - ${marginLeft}px)`,
      }}
    >
      {allDayEvents.map((event) => (
        <DayAllDayCalendarEvent
          calendarIdentity={resolveCalendarCardIdentity(calendarLookup, event)}
          columnIndex={getCalendarColumnIndex(event)}
          event={event}
          focusColor={resolveCalendarFocusColor(calendarLookup, event)}
          isActiveDraft={isActiveDraftEvent(event, draft, savedEventIds)}
          isPlaceholder={isDraftOnlyEvent(event, draft, savedEventIds)}
          isReadOnly={isGridEventInteractionReadOnly(calendarLookup, event)}
          key={event._id ?? "all-day-draft"}
          measurements={measurements}
          onOpenEvent={onOpenEvent}
          visibleDates={visibleDates}
        />
      ))}
    </div>
  );
};

export const DayCalendarTimedEventsLayer = ({
  draft,
  events: timedEvents,
  getCalendarColumnIndex,
  isDisplayedEvent,
  measurements,
  onOpenEvent,
  visibleDates,
}: DayTimedEventsProps) => {
  // One lookup build for the whole list (packet 08 step 5) - not per card.
  const calendarLookup = useCalendarLookup();
  const savedEventIds = useMemo(
    () => getCalendarEventIdSet(timedEvents),
    [timedEvents],
  );
  const renderedEvents = useMemo(
    () =>
      addVisibleDraftEvent({
        draft,
        events: timedEvents,
        isAllDay: false,
        visibleDates,
      }).filter(isDisplayedEvent),
    [draft, isDisplayedEvent, timedEvents, visibleDates],
  );
  const timedEventItems = useMemo(() => {
    const eventsByColumn = new Map<number, GridEvent[]>();
    for (const event of renderedEvents) {
      const columnIndex = getCalendarColumnIndex(event);
      const columnEvents = eventsByColumn.get(columnIndex) ?? [];
      columnEvents.push(event);
      eventsByColumn.set(columnIndex, columnEvents);
    }
    return [...eventsByColumn.values()].flatMap(createTimedEventLayout);
  }, [getCalendarColumnIndex, renderedEvents]);

  return (
    <div id={ID_GRID_EVENTS_TIMED}>
      {timedEventItems.map(({ deckLayout, event }) => (
        <DayTimedCalendarEvent
          calendarIdentity={resolveCalendarCardIdentity(calendarLookup, event)}
          columnIndex={getCalendarColumnIndex(event)}
          deckLayout={deckLayout}
          event={event}
          focusColor={resolveCalendarFocusColor(calendarLookup, event)}
          isActiveDraft={isActiveDraftEvent(event, draft, savedEventIds)}
          isPlaceholder={isDraftOnlyEvent(event, draft, savedEventIds)}
          isReadOnly={isGridEventInteractionReadOnly(calendarLookup, event)}
          key={event._id ?? "timed-draft"}
          measurements={measurements}
          onOpenEvent={onOpenEvent}
          visibleDates={visibleDates}
        />
      ))}
    </div>
  );
};
