import dayjs from "@core/util/date/dayjs";
import { type GridEvent } from "@web/common/types/web.event.types";
import {
  createTimedEventLayout,
  type TimedDeckLayout,
} from "@web/grid/layout/timed-deck.layout";

export const getActiveTimedDraftDeckLayout = (
  draft: GridEvent | null,
  events: GridEvent[],
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
    createTimedEventLayout(draftDayEvents).find(
      ({ event }) => event._id === draft._id,
    )?.deckLayout ?? null
  );
};
