import { useMemo } from "react";
import { useCalendarLookup } from "@web/calendars/useCalendarLookup";
import {
  ID_GRID_EVENTS_ALLDAY,
  ID_GRID_EVENTS_TIMED,
} from "@web/common/constants/web.constants";
import { type GridEvent } from "@web/common/types/web.event.types";
import { type GridEventDraft } from "@web/events/event-draft.types";
import { getGridDraftId } from "@web/events/grid-event-draft.adapter";
import { isEventIdHidden } from "@web/events/hidden/hidden-event-id";
import { useHiddenEventIds } from "@web/events/hidden/hidden-events.query";
import { GridRegisteredAllDayEvent } from "@web/grid/components/GridRegisteredAllDayEvent";
import { GridRegisteredTimedEvent } from "@web/grid/components/GridRegisteredTimedEvent";
import { resolveGridEventCardChrome } from "@web/grid/grid-event-card-chrome";
import { useGridMarginLeft } from "@web/grid/grid-margin";
import { createTimedEventLayout } from "@web/grid/layout/timed-deck.layout";
import {
  type GridMeasurements,
  type GridVisibleDate,
} from "@web/grid/types/grid.types";
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

function hiddenEventIdsWithoutActiveDraft(
  hiddenEventIds: ReadonlySet<string>,
  draft: GridEventDraft | null,
): ReadonlySet<string> {
  const draftId = draft ? getGridDraftId(draft) : undefined;
  if (!draftId || !isEventIdHidden(draftId, hiddenEventIds)) {
    return hiddenEventIds;
  }
  const next = new Set(hiddenEventIds);
  next.delete(draftId);
  return next;
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
  const hiddenEventIds = useHiddenEventIds();
  const layoutHiddenEventIds = useMemo(
    () => hiddenEventIdsWithoutActiveDraft(hiddenEventIds, draft),
    [draft, hiddenEventIds],
  );
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
      {allDayEvents.map((event) => {
        const chrome = resolveGridEventCardChrome(
          calendarLookup,
          event,
          layoutHiddenEventIds,
        );
        return (
          <GridRegisteredAllDayEvent
            calendarIdentity={chrome.calendarIdentity}
            columnIndex={getCalendarColumnIndex(event)}
            event={event}
            focusColor={chrome.focusColor}
            isActiveDraft={isActiveDraftEvent(event, draft, savedEventIds)}
            isDraft={isDraftOnlyEvent(event, draft, savedEventIds)}
            isHidden={chrome.isHidden}
            isPlaceholder={isDraftOnlyEvent(event, draft, savedEventIds)}
            isReadOnly={chrome.isReadOnly}
            key={event._id ?? "all-day-draft"}
            measurements={measurements}
            onEventKeyDown={onOpenEvent}
            view="day"
            visibleDates={visibleDates}
          />
        );
      })}
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
  const hiddenEventIds = useHiddenEventIds();
  const layoutHiddenEventIds = useMemo(
    () => hiddenEventIdsWithoutActiveDraft(hiddenEventIds, draft),
    [draft, hiddenEventIds],
  );
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
    return [...eventsByColumn.values()].flatMap((columnEvents) =>
      createTimedEventLayout(columnEvents, layoutHiddenEventIds),
    );
  }, [getCalendarColumnIndex, layoutHiddenEventIds, renderedEvents]);

  return (
    <div id={ID_GRID_EVENTS_TIMED}>
      {timedEventItems.map(({ deckLayout, event, isHidden }) => {
        const chrome = resolveGridEventCardChrome(
          calendarLookup,
          event,
          layoutHiddenEventIds,
        );
        return (
          <GridRegisteredTimedEvent
            calendarIdentity={chrome.calendarIdentity}
            columnIndex={getCalendarColumnIndex(event)}
            deckLayout={deckLayout}
            event={event}
            focusColor={chrome.focusColor}
            isActiveDraft={isActiveDraftEvent(event, draft, savedEventIds)}
            isHidden={isHidden}
            isPlaceholder={isDraftOnlyEvent(event, draft, savedEventIds)}
            isReadOnly={chrome.isReadOnly}
            key={event._id ?? "timed-draft"}
            measurements={measurements}
            onEventKeyDown={onOpenEvent}
            positionAsDraft={isDraftOnlyEvent(event, draft, savedEventIds)}
            view="day"
            visibleDates={visibleDates}
          />
        );
      })}
    </div>
  );
};
