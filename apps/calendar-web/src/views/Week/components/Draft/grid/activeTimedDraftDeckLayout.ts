import dayjs from "@core/util/date/dayjs";
import { type GridEvent } from "@web/common/types/web.event.types";
import {
  EMPTY_HIDDEN_EVENT_IDS,
  isEventIdHidden,
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
      !event.isAllDay &&
      dayjs(event.startDate).isSame(draft.startDate, "day") &&
      // Match the grid: hidden partners render as strips, not deck members.
      (event._id === draft._id || !isEventIdHidden(event._id, hiddenEventIds)),
  );

  return (
    createTimedEventLayout(draftDayEvents).find(
      ({ event }) => event._id === draft._id,
    )?.deckLayout ?? null
  );
};
