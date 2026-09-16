import { type DateTime, DateTimeSchema } from "@core/types/domain-primitives";
import { type Event } from "@core/types/event.contracts";

export const EVENT_TITLE_SEARCH_LIMIT = 20;
export const EVENT_TITLE_SEARCH_PALETTE_LIMIT = 8;
export const EVENT_TITLE_SEARCH_MIN = 2;
export const EVENT_TITLE_SEARCH_MAX = 80;

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

export function eventTitleSearchWindow(now = Date.now()): {
  start: DateTime;
  end: DateTime;
} {
  return {
    start: DateTimeSchema.parse(new Date(now - YEAR_MS).toISOString()),
    end: DateTimeSchema.parse(new Date(now + YEAR_MS).toISOString()),
  };
}

export function eventTitle(event: Event): string {
  return event.content.kind === "details" ? event.content.title : "";
}

export function eventStartMs(event: Event): number {
  if (event.schedule.kind === "allDay") {
    return Date.parse(`${event.schedule.start}T00:00:00.000Z`);
  }
  return Date.parse(event.schedule.start);
}

/** Case-insensitive title substring, ±1 year from `now`, nearest first. */
export function searchEventsByTitle(
  events: readonly Event[],
  q: string,
  now = Date.now(),
  limit = EVENT_TITLE_SEARCH_LIMIT,
): Event[] {
  const needle = q.trim().toLowerCase();
  if (needle.length < EVENT_TITLE_SEARCH_MIN) return [];

  const window = eventTitleSearchWindow(now);
  const windowStart = Date.parse(window.start);
  const windowEnd = Date.parse(window.end);

  return events
    .filter((event) => {
      const start = eventStartMs(event);
      if (Number.isNaN(start) || start < windowStart || start > windowEnd) {
        return false;
      }
      return eventTitle(event).toLowerCase().includes(needle);
    })
    .sort(
      (left, right) =>
        Math.abs(eventStartMs(left) - now) -
        Math.abs(eventStartMs(right) - now),
    )
    .slice(0, limit);
}
