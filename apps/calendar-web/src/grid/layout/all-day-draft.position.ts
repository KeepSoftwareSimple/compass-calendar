import { type GridEvent } from "@web/common/types/web.event.types";
import {
  shouldRenderTimedInAllDayRow,
  timedMultiDayToAllDayDates,
} from "@web/common/utils/event/event-nudge.util";
import { assignEventsToRow } from "@web/common/utils/grid/assign.row";
import { type GridEventDraft } from "@web/events/event-draft.types";
import {
  getGridDraftId,
  gridEventDraftToGridEvent,
} from "@web/events/grid-event-draft.adapter";
import { inEffectiveTimeZone } from "@web/timezone/in-time-zone";

export const isDraftRenderedInAllDayRow = (draft: GridEventDraft): boolean => {
  const { schedule } = draft.values;

  return (
    schedule.kind === "allDay" ||
    (schedule.kind === "timed" &&
      shouldRenderTimedInAllDayRow(
        inEffectiveTimeZone(schedule.start),
        inEffectiveTimeZone(schedule.end),
      ))
  );
};

export const draftToAllDayRowGridEvent = (draft: GridEventDraft): GridEvent => {
  const { schedule } = draft.values;

  if (schedule.kind === "allDay") {
    return gridEventDraftToGridEvent(draft);
  }

  const dates = timedMultiDayToAllDayDates(
    inEffectiveTimeZone(schedule.start),
    inEffectiveTimeZone(schedule.end),
  );

  return {
    ...gridEventDraftToGridEvent(draft),
    endDate: dates.endDate,
    isAllDay: true,
    isTimedMultiDayDisplay: true,
    startDate: dates.startDate,
  };
};

export const positionAllDayDraftEvent = ({
  draft,
  events,
}: {
  draft: GridEventDraft | null;
  events: GridEvent[];
}): {
  activeDraftEvent: GridEvent | null;
  events: GridEvent[];
} => {
  if (!draft || !isDraftRenderedInAllDayRow(draft)) {
    return { activeDraftEvent: null, events };
  }

  const draftEvent = draftToAllDayRowGridEvent(draft);
  const draftId = getGridDraftId(draft);
  const existingIndex = draftId
    ? events.findIndex((event) => event._id === draftId)
    : -1;
  const eventForRows =
    existingIndex === -1
      ? draftEvent
      : {
          ...draftEvent,
          position: events[existingIndex].position,
          row: events[existingIndex].row,
        };
  const eventsWithDraft =
    existingIndex === -1
      ? [...events, eventForRows]
      : events.map((event, index) =>
          index === existingIndex ? eventForRows : event,
        );
  const positionedEvents = assignEventsToRow(eventsWithDraft).allDayEvents;
  const activeDraftIndex =
    existingIndex === -1 ? positionedEvents.length - 1 : existingIndex;

  return {
    activeDraftEvent: positionedEvents[activeDraftIndex] ?? null,
    events: positionedEvents,
  };
};
