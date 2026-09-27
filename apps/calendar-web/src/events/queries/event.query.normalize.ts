import { type Event } from "@core/types/event.contracts";
import { type NormalizedEvents } from "@web/events/event-view.types";
import { type LocalEventRecord } from "@web/events/types/local-event.record";

/**
 * Normalize a list of events into the `{ ids, entities }` shape the query
 * caches store, keyed by `id`. Duplicate ids resolve last-write-wins in
 * `entities`, and `ids` keeps only the FIRST appearance of each id.
 *
 * `ids` is the render order: every consumer walks it and looks each id up in
 * `entities` (event.view-model.ts `eventsFrom`), so an id listed twice draws
 * the same event twice - two byte-identical cards on the same day, which is
 * what a duplicated event in the grid actually is. The list arrives already
 * concatenated from several sources that can each name the same event: the
 * backend drains every page of a range read and sync appends one series base
 * row per PAGE, and a series master plus an exception for the same instant
 * both assemble to the same composed occurrence id. De-duplicating here is
 * the one place that covers all of them, since id equality already means
 * "the same event" everywhere downstream.
 */
export const normalizeEventList = (events: Event[]): NormalizedEvents => {
  const entities: NormalizedEvents["entities"] = {};
  const ids: Event["id"][] = [];
  for (const event of events) {
    if (!(event.id in entities)) ids.push(event.id);
    entities[event.id] = event;
  }
  return { ids, entities };
};

/**
 * Normalize local IndexedDB records, preserving demo-event metadata for grid
 * styling and onboarding affordances.
 */
export const normalizeLocalEventRecords = (
  records: LocalEventRecord[],
): NormalizedEvents => ({
  ...normalizeEventList(records.map((record) => record.event)),
  demoEventIds: records
    .filter((record) => record.isDemo)
    .map((record) => record.id),
});

/**
 * Single source of truth for "does this event belong in this [start, end)
 * instant range". Shared by the read/normalize pipeline and the mutation
 * optimistic-insert logic so reads and optimistic writes agree on membership.
 * Mirrors the backend's own overlap semantics exactly (event.repository.ts
 * range branches): timed events overlap by instant, all-day events overlap by
 * the calendar-date slice of the query's own start/end instants — see
 * LocalEventRepository/indexeddb-offline-data.store.ts `getEvents`, which
 * implements the identical filter for local/offline mode.
 */
export const eventMatchesRange = (
  event: Event,
  start?: string,
  end?: string,
): boolean => {
  if (!start || !end) return false;

  if (event.schedule.kind === "timed") {
    return (
      Date.parse(event.schedule.start) < Date.parse(end) &&
      Date.parse(event.schedule.end) > Date.parse(start)
    );
  }

  if (event.schedule.kind === "allDay") {
    const allDayStart = start.slice(0, 10);
    const allDayEnd = end.slice(0, 10);
    return event.schedule.start < allDayEnd && event.schedule.end > allDayStart;
  }

  return false;
};
