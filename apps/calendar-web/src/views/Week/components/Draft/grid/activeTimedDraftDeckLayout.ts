import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import { type GridEvent } from "@web/common/types/web.event.types";
import {
  EMPTY_HIDDEN_EVENT_IDS,
  withoutHiddenEventId,
} from "@web/events/hidden/hidden-event-id";
import {
  createTimedEventLayout,
  type TimedDeckLayout,
} from "@web/grid/layout/timed-deck.layout";
import { getEffectiveTimeZone } from "@web/timezone/effective-timezone.store";
import { parseGridScheduleDate } from "@web/timezone/parse-grid-schedule-date";

export const getActiveTimedDraftDeckLayout = (
  draft: GridEvent | null,
  events: GridEvent[],
  hiddenEventIds: ReadonlySet<string> = EMPTY_HIDDEN_EVENT_IDS,
): TimedDeckLayout | null => {
  if (!draft?._id || draft.isAllDay) {
    return null;
  }

  const draftIndex = events.findIndex((event) => event._id === draft._id);
  if (draftIndex === -1) {
    return null;
  }

  const eventsWithDraft = [...events];
  eventsWithDraft[draftIndex] = draft;
  const calendarZone = getEffectiveTimeZone();
  const draftDayKey = parseGridScheduleDate(
    draft.startDate,
    draft.timeZone ?? calendarZone,
  )
    .tz(calendarZone)
    .format(YEAR_MONTH_DAY_FORMAT);
  const draftDayEvents = eventsWithDraft.filter((event) => {
    if (event.isAllDay) return false;
    const eventZone = event.timeZone ?? calendarZone;
    const dayKey = parseGridScheduleDate(event.startDate, eventZone)
      .tz(calendarZone)
      .format(YEAR_MONTH_DAY_FORMAT);
    return dayKey === draftDayKey;
  });

  return (
    createTimedEventLayout(
      draftDayEvents,
      withoutHiddenEventId(hiddenEventIds, draft._id),
    ).find(({ event }) => event._id === draft._id)?.deckLayout ?? null
  );
};
