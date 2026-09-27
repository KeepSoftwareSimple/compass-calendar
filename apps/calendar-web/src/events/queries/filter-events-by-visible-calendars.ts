import { type Calendar } from "@core/types/calendar.contracts";
import { type NormalizedEventQueryData } from "./event.query.types";

/**
 * Drop events whose calendar is hidden or retired (no longer active at the
 * provider). When calendars have not loaded yet, pass the data through
 * unchanged so the grid does not flash empty.
 *
 * Pure: useCalendarEventViewModel memoizes the whole pipeline this belongs to,
 * so there is nothing to cache here.
 */
export function filterEventsByVisibleCalendars(
  data: NormalizedEventQueryData | undefined,
  calendars: Calendar[] | undefined,
): NormalizedEventQueryData | undefined {
  if (!data || !calendars) return data;

  const visibleIds = new Set(
    calendars
      .filter((calendar) => calendar.isActive && calendar.isVisible)
      .map((c) => c.id),
  );

  const ids = data.ids.filter((id) => {
    const event = data.entities[id];
    return event !== undefined && visibleIds.has(event.calendarId);
  });

  if (ids.length === data.ids.length) return data;

  const kept = new Set(ids);
  const entities = { ...data.entities };
  for (const id of data.ids) {
    if (!kept.has(id)) delete entities[id];
  }

  return {
    ...data,
    ids,
    entities,
  };
}
