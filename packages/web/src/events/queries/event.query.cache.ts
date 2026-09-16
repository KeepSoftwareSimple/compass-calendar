import { type QueryClient, type QueryKey } from "@tanstack/react-query";
import { type EventId } from "@core/types/domain-primitives";
import { type Event } from "@core/types/event.contracts";
import { isDateRangeOverlapping } from "@core/util/date/date.util";
import { type RecurringEditProjection } from "@web/events/recurrence/projectRecurringEdit";
import { type EventRepositorySource } from "@web/events/repositories/event.repository.factory";
import { eventQueryKeys } from "./event.query.keys";
import { eventMatchesRange } from "./event.query.normalize";
import {
  type EventQueryKey,
  type EventQueryKeyMetadata,
  type EventQueryScope,
  type NormalizedEventQueryData,
} from "./event.query.types";

// `NormalizedEventQueryData.entities` is keyed by the branded `EventId`;
// several call sites here still pass a plain `string` id (component territory
// hasn't threaded the brand through everywhere yet). Cache-projection code
// only ever indexes with an id that came from an `Event.id` originally, so
// this is a safe internal cast, not a validated contract boundary.
const asEventId = (id: string) => id as EventId;

export type EventQueryEntry = {
  queryKey: EventQueryKey;
  data: NormalizedEventQueryData;
  scope: EventQueryScope;
  metadata: EventQueryKeyMetadata;
};

type EventQueryFilter = {
  source?: EventRepositorySource;
  scope?: EventQueryScope;
};

export const isEventQueryKey = (
  queryKey: QueryKey,
): queryKey is EventQueryKey => {
  if (queryKey[0] !== eventQueryKeys.all[0] || queryKey.length !== 3) {
    return false;
  }

  const scope = queryKey[1];
  const metadata = queryKey[2];
  return (
    (scope === "day" || scope === "week") &&
    typeof metadata === "object" &&
    metadata !== null &&
    "source" in metadata
  );
};

const matchesFilter = (entry: EventQueryEntry, filter: EventQueryFilter) =>
  (filter.source === undefined || entry.metadata.source === filter.source) &&
  (filter.scope === undefined || entry.scope === filter.scope);

export function getEventQueryEntries(
  queryClient: QueryClient,
  filter: EventQueryFilter = {},
): EventQueryEntry[] {
  return queryClient
    .getQueriesData<NormalizedEventQueryData>({ queryKey: eventQueryKeys.all })
    .flatMap(([queryKey, data]) => {
      if (!data || !isEventQueryKey(queryKey)) return [];
      const entry: EventQueryEntry = {
        queryKey,
        data,
        scope: queryKey[1],
        metadata: queryKey[2],
      };
      return matchesFilter(entry, filter) ? [entry] : [];
    });
}

export function findEventInCache(
  queryClient: QueryClient,
  eventId: string,
  source?: EventRepositorySource,
): Event | null {
  for (const { data } of getEventQueryEntries(queryClient, { source })) {
    const event = data.entities[eventId as EventId];
    if (event) return event;
  }
  return null;
}

export function findSeriesEventsInCache(
  queryClient: QueryClient,
  seriesId: string,
  source?: EventRepositorySource,
): Event[] {
  const events = new Map<string, Event>();
  for (const { data } of getEventQueryEntries(queryClient, { source })) {
    for (const id of data.ids) {
      const event = data.entities[id];
      if (
        event?.recurrence.kind === "occurrence" &&
        event.recurrence.seriesId === seriesId
      ) {
        events.set(id, event);
      }
    }
  }
  return [...events.values()];
}

/**
 * Canonical "does this event belong in this cached entry" test, combining the
 * repository source and the range predicate. Used by every optimistic
 * insert/upsert so a mutation lands events in exactly the entries a subsequent
 * read would return them from.
 */
export function eventBelongsToEntry(
  event: Event,
  entry: EventQueryEntry,
  source: EventRepositorySource,
): boolean {
  if (entry.metadata.source !== source) return false;

  return eventMatchesRange(event, entry.metadata.start, entry.metadata.end);
}

/**
 * Builds placeholder read data for a requested day or week range by merging
 * events from any cached week entries whose stored range overlaps it. Returns
 * an empty normalized set when an overlapping week is cached but has no
 * events in the requested window (so empty days do not spin). Returns
 * `undefined` only when no overlapping week cache exists, so true first
 * loads still show the loading state.
 */
export function deriveOverlappingEventQueryData(
  queryClient: QueryClient,
  args: {
    source: EventRepositorySource;
    startDate: string;
    endDate: string;
  },
): NormalizedEventQueryData | undefined {
  const { source, startDate, endDate } = args;
  const entities: NormalizedEventQueryData["entities"] = {};
  const ids: EventId[] = [];
  const seenIds = new Set<string>();
  let foundOverlappingWeek = false;

  for (const entry of getEventQueryEntries(queryClient, {
    source,
    scope: "week",
  })) {
    if (
      !isDateRangeOverlapping(
        entry.metadata.start,
        entry.metadata.end,
        startDate,
        endDate,
      )
    ) {
      continue;
    }

    foundOverlappingWeek = true;

    for (const id of entry.data.ids) {
      if (seenIds.has(id)) continue;
      const event = entry.data.entities[id];
      // Skip incomplete cache rows (tests / corrupt entries) so placeholder
      // derivation never throws while reading a neighboring range.
      if (!event?.schedule || !eventMatchesRange(event, startDate, endDate)) {
        continue;
      }
      seenIds.add(id);
      ids.push(id);
      entities[id] = event;
    }
  }

  return foundOverlappingWeek ? { ids, entities } : undefined;
}

// Shared by every writer below: find the matching cached query entries and
// replace each one's data via `update`, returning `current` unchanged (and
// skipping the write) when there's nothing to update yet.
function forEachEventQuery(
  queryClient: QueryClient,
  filter: EventQueryFilter,
  update: (
    current: NormalizedEventQueryData,
    entry: EventQueryEntry,
  ) => NormalizedEventQueryData,
) {
  for (const entry of getEventQueryEntries(queryClient, filter)) {
    queryClient.setQueryData<NormalizedEventQueryData>(
      entry.queryKey,
      (current) => (current ? update(current, entry) : current),
    );
  }
}

export function insertEventIntoQueries(
  queryClient: QueryClient,
  event: Event,
  isMember: (entry: EventQueryEntry) => boolean,
) {
  forEachEventQuery(queryClient, {}, (current, entry) => {
    if (!isMember(entry)) return current;
    const isPresent = current.ids.includes(event.id);
    return {
      ...current,
      ids: isPresent ? current.ids : [...current.ids, event.id],
      entities: { ...current.entities, [event.id]: event },
    };
  });
}

/**
 * Reconcile an edited event against every cached entry for its source: insert
 * it into ranges it now belongs to, patch it where already present, and remove
 * it from ranges it no longer belongs to. Restores the pre-migration behavior
 * where an event dragged/edited into the current view rendered optimistically
 * instead of only after the settle-time refetch.
 */
export function upsertEventAcrossQueries(
  queryClient: QueryClient,
  event: Event,
  isMember: (entry: EventQueryEntry) => boolean,
  filter: EventQueryFilter = {},
) {
  const id = event.id;

  forEachEventQuery(queryClient, filter, (current, entry) => {
    const present = current.ids.includes(id) || Boolean(current.entities[id]);
    if (isMember(entry)) {
      const existing = current.entities[id];
      return {
        ...current,
        ids: present ? current.ids : [...current.ids, id],
        entities: {
          ...current.entities,
          [id]: existing ? { ...existing, ...event } : event,
        },
      };
    }
    if (!present) return current;
    const entities = { ...current.entities };
    delete entities[id];
    return {
      ...current,
      ids: current.ids.filter((entryId) => entryId !== id),
      entities,
    };
  });
}

export function applyEventProjectionAcrossQueries(
  queryClient: QueryClient,
  projection: RecurringEditProjection,
  source: EventRepositorySource,
) {
  forEachEventQuery(queryClient, { source }, (current, entry) => {
    const entities = { ...current.entities };
    let ids = current.ids.filter((id) => !projection.removeIds.has(id));
    for (const id of projection.removeIds) delete entities[asEventId(id)];

    for (const event of projection.upserts) {
      const id = event.id;
      const belongs = eventBelongsToEntry(event, entry, source);
      if (!belongs) {
        ids = ids.filter((entryId) => entryId !== id);
        delete entities[id];
        continue;
      }
      if (!ids.includes(id)) ids.push(id);
      entities[id] = entities[id] ? { ...entities[id], ...event } : event;
    }

    return { ...current, ids, entities };
  });
}

export function patchEventInQueries(
  queryClient: QueryClient,
  eventId: string,
  patch: Partial<Event> | ((event: Event) => Event),
  filter: EventQueryFilter = {},
) {
  forEachEventQuery(queryClient, filter, (current) => {
    const existing = current.entities[eventId as EventId];
    if (!existing) return current;
    const updated =
      typeof patch === "function" ? patch(existing) : { ...existing, ...patch };
    return {
      ...current,
      entities: { ...current.entities, [asEventId(eventId)]: updated },
    };
  });
}

export function removeEventFromQueries(
  queryClient: QueryClient,
  eventId: string,
  filter: EventQueryFilter = {},
) {
  forEachEventQuery(queryClient, filter, (current) => {
    if (
      !current.entities[asEventId(eventId)] &&
      !current.ids.includes(asEventId(eventId))
    ) {
      return current;
    }
    const entities = { ...current.entities };
    delete entities[asEventId(eventId)];
    return {
      ...current,
      ids: current.ids.filter((id) => id !== eventId),
      entities,
    };
  });
}

/**
 * Drops cached events whose calendarId belongs to a revoked/archived google
 * calendar (B14/A16/A34 parity). Replaces the legacy origin-based prune —
 * `origin` no longer exists on `Event`; membership is by calendar id instead.
 */
export function removeEventsByCalendarFromQueries(
  queryClient: QueryClient,
  calendarIds: ReadonlySet<string>,
) {
  if (calendarIds.size === 0) return;
  forEachEventQuery(queryClient, {}, (current) => {
    const removedIds = new Set(
      current.ids.filter((id) =>
        calendarIds.has(current.entities[id]?.calendarId ?? ""),
      ),
    );
    if (removedIds.size === 0) return current;
    const entities = { ...current.entities };
    for (const id of removedIds) delete entities[id];
    return {
      ...current,
      ids: current.ids.filter((id) => !removedIds.has(id)),
      entities,
    };
  });
}
