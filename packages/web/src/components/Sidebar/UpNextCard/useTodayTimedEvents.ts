import { useMinuteTick } from "@web/common/hooks/useMinuteTick";
import { useDayEventViewModel } from "@web/events/queries/useDayEventsQuery";
import { notifiableEventQueryRange } from "@web/notifications/upcoming-notifier.logic";

/**
 * Today's timed events with their real start/end bounds, ticking every minute.
 * Shared by the up-next card and the upcoming-event notifier so the multi-day
 * bounds restoration below lives in exactly one place.
 *
 * Kept off `useUpNextEvent` so RootShell's notifier does not pull the grid
 * draft adapter (rrule / bson) into the boot graph.
 */
export function useTodayTimedEvents() {
  const now = useMinuteTick();
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
      if (!source || source.schedule.kind !== "timed") return [];
      return [
        {
          ...gridEvent,
          startDate: source.schedule.start,
          endDate: source.schedule.end,
        },
      ];
    });

  return { now, events, allTimedEvents: [...timedEvents, ...multiDayTimed] };
}
