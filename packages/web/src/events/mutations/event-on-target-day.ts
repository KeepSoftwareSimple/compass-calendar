import { YEAR_MONTH_DAY_FORMAT } from "@core/constants/date.constants";
import { type Event, EventScheduleSchema } from "@core/types/event.contracts";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import { calendarDateInEffectiveTimeZone } from "@web/timezone/in-time-zone";

/** Calendar day of an event's start, in the event's zone (timed) or effective zone (all-day). */
export function eventStartDay(event: Event): Dayjs {
  if (event.schedule.kind === "timed") {
    return dayjs(event.schedule.start)
      .tz(event.schedule.timeZone)
      .startOf("day");
  }

  return calendarDateInEffectiveTimeZone(event.schedule.start).startOf("day");
}

/**
 * Same event on `targetDay`: timed copies keep time of day and duration;
 * all-day copies keep length. Identity when the start is already that day.
 */
export function eventOnTargetDay(event: Event, targetDay: Dayjs): Event {
  const targetKey = targetDay.format(YEAR_MONTH_DAY_FORMAT);
  const sourceKey = eventStartDay(event).format(YEAR_MONTH_DAY_FORMAT);
  if (targetKey === sourceKey) return event;

  const deltaDays = dayjs(targetKey).diff(dayjs(sourceKey), "day");
  const { schedule } = event;

  if (schedule.kind === "timed") {
    const start = dayjs(schedule.start).tz(schedule.timeZone);
    const end = dayjs(schedule.end).tz(schedule.timeZone);
    return {
      ...event,
      schedule: EventScheduleSchema.parse({
        kind: "timed",
        start: start.add(deltaDays, "day").format(),
        end: end.add(deltaDays, "day").format(),
        timeZone: schedule.timeZone,
      }),
    };
  }

  return {
    ...event,
    schedule: EventScheduleSchema.parse({
      kind: "allDay",
      start: targetKey,
      end: dayjs(schedule.end)
        .add(deltaDays, "day")
        .format(YEAR_MONTH_DAY_FORMAT),
    }),
  };
}
