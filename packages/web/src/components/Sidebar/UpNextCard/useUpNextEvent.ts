import { useCallback } from "react";
import dayjs from "@core/util/date/dayjs";
import { useTodayTimedEvents } from "@web/components/Sidebar/UpNextCard/useTodayTimedEvents";
import { editGridEventDraft } from "@web/events/grid-event-draft.adapter";
import { draftActions } from "@web/events/stores/draft.store";

export function useUpNextEvent() {
  const { now, events, allTimedEvents } = useTodayTimedEvents();

  const nowEvents = allTimedEvents
    .filter(
      (event) =>
        dayjs(event.startDate).isSameOrBefore(now) &&
        dayjs(event.endDate).isAfter(now),
    )
    .sort((a, b) => dayjs(a.endDate).valueOf() - dayjs(b.endDate).valueOf());

  const upcomingEvents = allTimedEvents
    .filter((event) => dayjs(event.startDate).isAfter(now))
    .sort(
      (a, b) => dayjs(a.startDate).valueOf() - dayjs(b.startDate).valueOf(),
    );

  const upNext = nowEvents[0] || upcomingEvents[0];
  const isCurrentEvent = !!nowEvents[0];

  const sourceEvent = upNext
    ? events.find((candidate) => candidate.id === upNext._id)
    : undefined;

  const openEventDetails = useCallback(
    (activity: "gridClick" | "keyboardEdit") => {
      if (!sourceEvent) return;

      const draft = editGridEventDraft(sourceEvent);
      if (!draft) return;

      draftActions.startGridDraft({ activity, draft });
    },
    [sourceEvent],
  );

  const conferenceUrl = upNext?.conference?.url;

  return { now, openEventDetails, upNext, conferenceUrl, isCurrentEvent };
}
