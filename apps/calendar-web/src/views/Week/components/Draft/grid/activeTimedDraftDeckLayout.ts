import dayjs from "@core/util/date/dayjs";
import { type GridEvent } from "@web/common/types/web.event.types";
import {
  EMPTY_HIDDEN_EVENT_IDS,
  withoutHiddenEventId,
} from "@web/events/hidden/hidden-event-id";
import {
  createTimedEventLayout,
  type TimedDeckLayout,
} from "@web/grid/layout/timed-deck.layout";

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
  const draftDayEvents = eventsWithDraft.filter(
    (event) =>
      !event.isAllDay && dayjs(event.startDate).isSame(draft.startDate, "day"),
  );

  return (
    createTimedEventLayout(
      draftDayEvents,
      withoutHiddenEventId(hiddenEventIds, draft._id),
    ).find(({ event }) => event._id === draft._id)?.deckLayout ?? null
  );
};
