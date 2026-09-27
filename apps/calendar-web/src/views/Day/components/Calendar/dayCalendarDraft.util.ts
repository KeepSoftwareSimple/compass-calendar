import { type GridEvent } from "@web/common/types/web.event.types";
import {
  shouldRenderTimedInAllDayRow,
  timedMultiDayToAllDayDates,
} from "@web/common/utils/event/event-nudge.util";
import { type GridEventDraft } from "@web/events/event-draft.types";
import {
  getGridDraftId,
  gridEventDraftToGridEvent,
} from "@web/events/grid-event-draft.adapter";
import {
  isDraftRenderedInAllDayRow,
  positionAllDayDraftEvent,
} from "@web/grid/layout/all-day-draft.position";
import { type GridVisibleDate } from "@web/grid/types/grid.types";
import {
  calendarDateInEffectiveTimeZone,
  inEffectiveTimeZone,
} from "@web/timezone/in-time-zone";

export const addVisibleDraftEvent = ({
  draft,
  events,
  isAllDay,
  visibleDates,
}: {
  draft: GridEventDraft | null;
  events: GridEvent[];
  isAllDay: boolean;
  visibleDates: GridVisibleDate[];
}) => {
  if (
    !draft ||
    isDraftRenderedInAllDayRow(draft) !== isAllDay ||
    !isDraftVisibleOnDate(draft, visibleDates)
  ) {
    return events;
  }

  if (isAllDay) {
    return positionAllDayDraftEvent({ draft, events }).events;
  }

  const draftEvent = gridEventDraftToGridEvent(draft);
  const draftId = getGridDraftId(draft);
  const existingIndex = events.findIndex((event) => event._id === draftId);

  if (existingIndex === -1) {
    return [draftEvent, ...events];
  }

  const nextEvents = [...events];
  nextEvents[existingIndex] = {
    ...draftEvent,
    position: events[existingIndex].position,
    row: events[existingIndex].row,
  };

  return nextEvents;
};

export const getCalendarEventIdSet = (events: GridEvent[]) =>
  new Set(events.map((event) => event._id).filter(isString));

export const isDraftOnlyEvent = (
  event: GridEvent,
  draft: GridEventDraft | null,
  savedEventIds: Set<string>,
) => {
  const draftId = draft ? getGridDraftId(draft) : undefined;
  return Boolean(
    event._id && event._id === draftId && !savedEventIds.has(event._id),
  );
};

export const isActiveDraftEvent = (
  event: GridEvent,
  draft: GridEventDraft | null,
  savedEventIds: Set<string>,
) => {
  const draftId = draft ? getGridDraftId(draft) : undefined;
  return Boolean(
    event._id && event._id === draftId && savedEventIds.has(event._id),
  );
};

export const isDraftVisibleOnDate = (
  draft: GridEventDraft,
  visibleDates: GridVisibleDate[],
) => {
  const visibleDate = visibleDates[0]?.date;

  if (!visibleDate) {
    return false;
  }

  const { schedule } = draft.values;

  if (schedule.kind === "timed") {
    if (
      shouldRenderTimedInAllDayRow(
        inEffectiveTimeZone(schedule.start),
        inEffectiveTimeZone(schedule.end),
      )
    ) {
      const dates = timedMultiDayToAllDayDates(
        inEffectiveTimeZone(schedule.start),
        inEffectiveTimeZone(schedule.end),
      );
      const visibleDay = visibleDate.startOf("day");
      const start = calendarDateInEffectiveTimeZone(dates.startDate);
      const end = calendarDateInEffectiveTimeZone(dates.endDate);
      const inclusiveEnd = end.isAfter(start) ? end.subtract(1, "day") : start;

      return (
        visibleDay.isSame(start) ||
        visibleDay.isSame(inclusiveEnd) ||
        (visibleDay.isAfter(start) && visibleDay.isBefore(inclusiveEnd))
      );
    }

    return inEffectiveTimeZone(schedule.start).isSame(visibleDate, "day");
  }

  const visibleDay = visibleDate.startOf("day");
  const start = inEffectiveTimeZone(schedule.start).startOf("day");
  const end = inEffectiveTimeZone(schedule.end).startOf("day");
  const inclusiveEnd = end.isAfter(start) ? end.subtract(1, "day") : start;

  return (
    visibleDay.isSame(start) ||
    visibleDay.isSame(inclusiveEnd) ||
    (visibleDay.isAfter(start) && visibleDay.isBefore(inclusiveEnd))
  );
};

const isString = (value: string | undefined): value is string =>
  typeof value === "string";
