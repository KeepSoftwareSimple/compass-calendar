import dayjs from "@core/util/date/dayjs";
import { useHiddenEventIds } from "@web/events/hidden/hidden-events.query";
import { useCalendarEventViewModel } from "@web/events/queries/useCalendarEventViewModel";
import { useWeekEventsQuery } from "@web/events/queries/useWeekEventsQuery";
import { useEffectiveTimeZone } from "@web/timezone/effective-timezone.store";
import { weekEventsQueryWindow } from "@web/views/Week/util/week-window.util";

export function LifeWeekEvents({ date }: { date: string }) {
  const zone = useEffectiveTimeZone();
  const week = useWeekEventsQuery(weekEventsQueryWindow(dayjs.tz(date, zone)));
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
    .filter((event) => !event.isDemo && !(event._id && hidden.has(event._id)))
    .sort(
      (a, b) => dayjs(a.startDate).valueOf() - dayjs(b.startDate).valueOf(),
    );
  if (!events.length) return <p>No calendar events this week.</p>;
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
