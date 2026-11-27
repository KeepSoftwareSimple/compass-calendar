import { HORIZON_PAST_MONTHS } from "@core/constants/sync-horizon.constants";
import dayjs from "@core/util/date/dayjs";
import { isEventIdHidden } from "@web/events/hidden/hidden-event-id";
import { useHiddenEventIds } from "@web/events/hidden/hidden-events.query";
import { useCalendarEventViewModel } from "@web/events/queries/useCalendarEventViewModel";
import { useWeekEventsQuery } from "@web/events/queries/useWeekEventsQuery";
import { useEventRepositorySource } from "@web/events/repositories/event.repository.source.store";
import { useEffectiveTimeZone } from "@web/timezone/effective-timezone.store";
import { weekEventsQueryWindow } from "@web/views/Week/util/week-window.util";

export function LifeWeekEvents({ date }: { date: string }) {
  const zone = useEffectiveTimeZone();
  const range = weekEventsQueryWindow(dayjs.tz(date, zone));
  const week = useWeekEventsQuery(range);
  const source = useEventRepositorySource();
  const { allDayEvents, timedEvents } = useCalendarEventViewModel(week.data);
  const hidden = useHiddenEventIds();
  if (week.isAwaitingSignIn) return <p>Sign in to see your calendar events.</p>;
  if (week.isError)
    return (
      <p>
        Couldn’t load this week.{" "}
        <button
          type="button"
          className="underline"
          onClick={() => void week.refetch()}
        >
          Retry
        </button>
      </p>
    );
  if (week.isPending || week.isPlaceholderData) return <p>Loading events…</p>;
  const events = [...allDayEvents, ...timedEvents]
    .filter((event) => !event.isDemo && !isEventIdHidden(event._id, hidden))
    .sort(
      (a, b) => dayjs(a.startDate).valueOf() - dayjs(b.startDate).valueOf(),
    );
  if (!events.length) {
    // Synced calendars only keep a rolling window, so an older week coming
    // back empty means "not kept", not "nothing happened".
    const beforeSyncWindow =
      source === "remote" &&
      range.startOfView.isBefore(
        dayjs().subtract(HORIZON_PAST_MONTHS, "month"),
      );
    return (
      <p>
        {beforeSyncWindow
          ? `Compass only keeps the last ${HORIZON_PAST_MONTHS} months of events.`
          : "No calendar events this week."}
      </p>
    );
  }
  return (
    <ul aria-label="Events this week" className="min-w-0">
      {events.slice(0, 3).map((event) => (
        <li key={event._id} className="truncate">
          {event.title || "Untitled event"}
        </li>
      ))}
    </ul>
  );
}
