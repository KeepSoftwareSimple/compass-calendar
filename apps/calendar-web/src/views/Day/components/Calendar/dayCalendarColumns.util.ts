import { type Calendar } from "@core/types/calendar.contracts";
import { type CalendarId } from "@core/types/domain-primitives";
import dayjs, { type Dayjs } from "@core/util/date/dayjs";
import { getDefaultTargetCalendar } from "@web/calendars/calendar.util";
import { type GridEvent } from "@web/common/types/web.event.types";
import { isEventVisibleOnGrid } from "@web/events/visibility/filter-events-visible-on-grid";
import { parseGridScheduleDate } from "@web/timezone/parse-grid-schedule-date";
import { dayEventQueryRange } from "@web/views/Day/util/day-window.util";
import { isAllDayEventOnDay } from "./dayAllDayRows.util";

type DayViewCalendarColumnInput = {
  allDayEvents: GridEvent[];
  calendars: Calendar[];
  dateInView: Dayjs;
  defaultTargetCalendar?: Calendar;
  hiddenEventIds: ReadonlySet<string>;
  pinnedCalendarIds?: ReadonlySet<CalendarId>;
  timedEvents: GridEvent[];
};

const EMPTY_PINNED_CALENDAR_IDS: ReadonlySet<CalendarId> = new Set();

const eligibleCalendarsInOrder = (calendars: Calendar[]): Calendar[] => {
  const eligible = calendars.filter(
    (calendar) => calendar.isActive && calendar.isVisible,
  );

  if (eligible.length > 0) {
    return eligible;
  }

  const primaryCalendar = calendars.find((calendar) => calendar.isPrimary);
  if (primaryCalendar) {
    return [primaryCalendar];
  }

  return calendars.slice(0, 1);
};

const timedEventOverlapsViewDay = (event: GridEvent, dateInView: Dayjs) => {
  const { startDate, endDate } = dayEventQueryRange(dateInView);
  const rangeStart = dayjs(startDate);
  const rangeEnd = dayjs(endDate);
  const eventStart = parseGridScheduleDate(event.startDate, event.timeZone);
  const eventEnd = parseGridScheduleDate(event.endDate, event.timeZone);
  return eventStart.isBefore(rangeEnd) && eventEnd.isAfter(rangeStart);
};

export const calendarIdsWithVisibleEventsOnDay = ({
  allDayEvents,
  dateInView,
  hiddenEventIds,
  timedEvents,
}: Pick<
  DayViewCalendarColumnInput,
  "allDayEvents" | "dateInView" | "hiddenEventIds" | "timedEvents"
>): Set<CalendarId> => {
  const ids = new Set<CalendarId>();

  for (const event of timedEvents) {
    if (
      !event.calendarId ||
      !isEventVisibleOnGrid(event, hiddenEventIds) ||
      event.isAllDay ||
      !timedEventOverlapsViewDay(event, dateInView)
    ) {
      continue;
    }
    ids.add(event.calendarId);
  }

  for (const event of allDayEvents) {
    if (
      !event.calendarId ||
      !isEventVisibleOnGrid(event, hiddenEventIds) ||
      !isAllDayEventOnDay(event, dateInView)
    ) {
      continue;
    }
    ids.add(event.calendarId);
  }

  return ids;
};

export const getDayViewCalendars = ({
  allDayEvents,
  calendars,
  dateInView,
  defaultTargetCalendar,
  hiddenEventIds,
  pinnedCalendarIds = EMPTY_PINNED_CALENDAR_IDS,
  timedEvents,
}: DayViewCalendarColumnInput): Calendar[] => {
  const ordered = eligibleCalendarsInOrder(calendars);
  const eventCalendarIds = calendarIdsWithVisibleEventsOnDay({
    allDayEvents,
    dateInView,
    hiddenEventIds,
    timedEvents,
  });

  const withEventsOrPinned = ordered.filter(
    (calendar) =>
      eventCalendarIds.has(calendar.id) || pinnedCalendarIds.has(calendar.id),
  );

  if (withEventsOrPinned.length > 0) {
    return withEventsOrPinned;
  }

  const fallback =
    defaultTargetCalendar ??
    getDefaultTargetCalendar(calendars) ??
    ordered[0] ??
    calendars[0];

  return fallback ? [fallback] : [];
};
