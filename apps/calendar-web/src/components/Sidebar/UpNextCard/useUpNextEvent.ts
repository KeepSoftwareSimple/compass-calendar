import { useCallback, useEffect, useMemo } from "react";
import {
  projectUpNextNudgeWindow,
  type UpNextNudgeCandidate,
} from "@core/up-next/up-next-nudge-window.util";
import dayjs from "@core/util/date/dayjs";
import { useMinuteTick } from "@web/common/hooks/useMinuteTick";
import { resolveUpNextJoinUrl } from "@web/components/Sidebar/UpNextCard/resolve-up-next-join-url";
import {
  type UpNextOpenActivity,
  upNextAvailabilityActions,
} from "@web/components/Sidebar/UpNextCard/up-next.availability.store";
import { upNextNudgeUiActions } from "@web/components/Sidebar/UpNextCard/up-next-nudge-ui.store";
import { editGridEventDraft } from "@web/events/grid-event-draft.adapter";
import { useHiddenEventIds } from "@web/events/hidden/hidden-events.query";
import { useDayEventViewModel } from "@web/events/queries/useDayEventsQuery";
import { draftActions } from "@web/events/stores/draft.store";
import { filterEventsVisibleOnGrid } from "@web/events/visibility/filter-events-visible-on-grid";
import { notifiableEventQueryRange } from "@web/notifications/upcoming-notifier.logic";

/**
 * Today's timed events with their real start/end bounds, ticking every minute.
 * Shared by the up-next card and the upcoming-event notifier so the multi-day
 * bounds restoration below lives in exactly one place.
 */
export function useTodayTimedEvents() {
  const now = useMinuteTick();
  const hiddenEventIds = useHiddenEventIds();
  const { startDate, endDate } = notifiableEventQueryRange(now);
  const { events, timedEvents, allDayEvents } = useDayEventViewModel({
    startDate,
    endDate,
  });
  // Restore the real timed bounds: the all-day-row projection rewrites both
  // dates to whole calendar days, and a date-only endDate would keep a
  // finished event looking like it is still running until midnight.
  const multiDayTimed = allDayEvents
    .filter((event) => event.isTimedMultiDayDisplay)
    .flatMap((gridEvent) => {
      const source = events.find((event) => event.id === gridEvent._id);
      if (source?.schedule.kind !== "timed") return [];
      return [
        {
          ...gridEvent,
          startDate: source.schedule.start,
          endDate: source.schedule.end,
        },
      ];
    });

  const allTimedEvents = useMemo(
    () =>
      filterEventsVisibleOnGrid(
        [...timedEvents, ...multiDayTimed],
        hiddenEventIds,
      ),
    [hiddenEventIds, multiDayTimed, timedEvents],
  );

  return { now, events, allTimedEvents };
}

export function useUpNextEvent() {
  const { now, events, allTimedEvents } = useTodayTimedEvents();

  const nowEvents = useMemo(
    () =>
      allTimedEvents
        .filter(
          (event) =>
            dayjs(event.startDate).isSameOrBefore(now) &&
            dayjs(event.endDate).isAfter(now),
        )
        .sort(
          (a, b) => dayjs(a.endDate).valueOf() - dayjs(b.endDate).valueOf(),
        ),
    [allTimedEvents, now],
  );

  const upcomingEvents = useMemo(
    () =>
      allTimedEvents
        .filter((event) => dayjs(event.startDate).isAfter(now))
        .sort(
          (a, b) => dayjs(a.startDate).valueOf() - dayjs(b.startDate).valueOf(),
        ),
    [allTimedEvents, now],
  );

  const upNext = nowEvents[0] || upcomingEvents[0];
  const isCurrentEvent = Boolean(nowEvents[0]);

  const nudgeCandidates = useMemo((): UpNextNudgeCandidate[] => {
    return allTimedEvents.flatMap((event) =>
      event._id
        ? [
            {
              id: event._id,
              title: event.title?.trim() || "Untitled event",
              startDate: event.startDate,
              endDate: event.endDate,
            },
          ]
        : [],
    );
  }, [allTimedEvents]);

  const nudgeWindow = useMemo(
    () => projectUpNextNudgeWindow(nudgeCandidates, now),
    [nudgeCandidates, now],
  );

  const sourceEvent = upNext
    ? events.find((candidate) => candidate.id === upNext._id)
    : undefined;

  const openEventById = useCallback(
    (eventId: string, activity: UpNextOpenActivity) => {
      const event = events.find((candidate) => candidate.id === eventId);
      if (!event) return;

      const draft = editGridEventDraft(event);
      if (!draft) return;

      draftActions.startGridDraft({ activity, draft });
      upNextNudgeUiActions.closePicker();
    },
    [events],
  );

  const openEventDetails = useCallback(
    (activity: UpNextOpenActivity) => {
      if (nudgeWindow.occurrences.length > 1) {
        upNextNudgeUiActions.showPicker(activity);
        return;
      }
      if (nudgeWindow.occurrences.length === 1) {
        openEventById(nudgeWindow.occurrences[0].id, activity);
        return;
      }
      if (!upNext?._id) return;
      openEventById(upNext._id, activity);
    },
    [nudgeWindow.occurrences, openEventById, upNext?._id],
  );

  const conferenceUrl = resolveUpNextJoinUrl(upNext, sourceEvent);

  const nudgePrimaryGridEvent = useMemo(() => {
    const primaryId = nudgeWindow.primary?.id;
    if (!primaryId) return undefined;
    return allTimedEvents.find((event) => event._id === primaryId);
  }, [allTimedEvents, nudgeWindow.primary?.id]);

  const nudgePrimarySourceEvent = nudgePrimaryGridEvent
    ? events.find((candidate) => candidate.id === nudgePrimaryGridEvent._id)
    : undefined;

  const nudgeConferenceUrl = resolveUpNextJoinUrl(
    nudgePrimaryGridEvent,
    nudgePrimarySourceEvent,
  );

  const pickerRows = useMemo(() => {
    return nudgeWindow.occurrences.map((occurrence) => {
      const gridEvent = allTimedEvents.find(
        (event) => event._id === occurrence.id,
      );
      const source = events.find((event) => event.id === occurrence.id);
      const joinUrl = resolveUpNextJoinUrl(gridEvent, source);
      return {
        ...occurrence,
        hasMeetingLink: Boolean(joinUrl),
      };
    });
  }, [allTimedEvents, events, nudgeWindow.occurrences]);

  useEffect(() => {
    upNextAvailabilityActions.publish({
      hasUpNext: Boolean(upNext),
      hasConference: Boolean(conferenceUrl),
      openEventDetails,
      joinMeeting: () => {
        if (conferenceUrl) {
          window.open(conferenceUrl, "_blank", "noopener,noreferrer");
        }
      },
    });
  }, [upNext, conferenceUrl, openEventDetails]);

  return {
    now,
    openEventDetails,
    openEventById,
    upNext,
    nudgeWindow,
    nudgePrimaryGridEvent,
    nudgeConferenceUrl,
    pickerRows,
    conferenceUrl,
    isCurrentEvent,
  };
}
