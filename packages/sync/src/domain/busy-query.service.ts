import { type EventId } from "@core/types/domain-primitives";
import { type AttendeeResponseStatus } from "@core/types/event-attendance.contracts";
import { type ConnectionState } from "@core/types/sync/connection.contracts";
import { type SyncEventCalendarId } from "@core/types/sync/event.contracts";
import {
  type ConnectionId,
  type PrincipalId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { occupancyFactsForEvent } from "@sync/domain/booking-occupancy-facts";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";
import { type EventRepository } from "@sync/storage/repositories/event.repository";
import {
  type CalendarGeneration,
  type EventOccurrenceRepository,
} from "@sync/storage/repositories/event-occurrence.repository";
import { type ProviderCalendarRepository } from "@sync/storage/repositories/provider-calendar.repository";
import { type ProviderConnectionRepository } from "@sync/storage/repositories/provider-connection.repository";
import { type SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";

// Cloud-only Compass events (`connectionId: null`) always persist at
// generation 0. See `buildCloudEventRecord` in cloud-command.service.ts.
const UNBACKED_CALENDAR_GENERATION = 0;

// After a cursor-expiry hold-off ends, reconcile may not sweep the resource
// until the next lap. Treat lastSuccessAt as fresh through this grace so
// booking does not flap unbookable between hold-off expiry and the next pull.
const HOLD_OFF_SWEEP_GRACE_MS = 15 * 60 * 1000;

// A normalized, half-open [start, end) busy interval on the UTC instant axis.
export interface BusyInterval {
  start: Date;
  end: Date;
  hostIsOrganizer?: boolean;
  hostResponseStatus?: AttendeeResponseStatus | null;
}

// Merge half-open [start, end) intervals into the minimal set of
// non-overlapping, non-adjacent intervals, sorted by start. Overlapping AND
// touching intervals merge — [9,10) and [10,11) leave no free gap between them,
// so availability must treat them as one busy block [9,11). Empty intervals
// (start >= end) contribute no busy time and are dropped. Pure and input-order
// independent.
const occupancyKey = (interval: BusyInterval): string =>
  `${interval.hostIsOrganizer ?? ""}:${interval.hostResponseStatus ?? ""}`;

export function mergeBusyIntervals(
  intervals: readonly BusyInterval[],
): BusyInterval[] {
  const sorted = intervals
    .filter((i) => i.end.getTime() > i.start.getTime())
    .sort(
      (a, b) =>
        a.start.getTime() - b.start.getTime() ||
        a.end.getTime() - b.end.getTime(),
    );

  const merged: BusyInterval[] = [];
  for (const current of sorted) {
    const last = merged[merged.length - 1];
    if (
      last &&
      occupancyKey(last) === occupancyKey(current) &&
      current.start.getTime() <= last.end.getTime()
    ) {
      // Overlapping or touching: extend the open block if this one reaches
      // further (a fully-nested interval leaves the end unchanged).
      if (current.end.getTime() > last.end.getTime()) last.end = current.end;
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

export interface BusyQueryDeps {
  occurrences: EventOccurrenceRepository;
}

export interface BusyQueryInput {
  tenantId: TenantId;
  principalId: PrincipalId;
  // The blocking calendars, each with the generation whose occurrences are live.
  calendars: readonly CalendarGeneration[];
  // Half-open query window [start, end).
  start: Date;
  end: Date;
  // Drop these events before merge. Unknown ids are ignored.
  excludeEventIds?: readonly EventId[];
  // Forwarded to listBusyOverlapping. Omit for the repository default.
  limit?: number;
}

// The merged busy intervals within [start, end) for the given calendars. Each
// occurrence interval is clamped to the window before merging, so an event that
// spills past either edge contributes only its in-window busy time. This returns
// intervals only; freshness/completeness/bookability evidence is layered on by a
// later slice.
export interface BusyOccurrenceInterval {
  start: Date;
  end: Date;
  eventId: EventId;
}

export interface BusyOccurrenceQueryResult {
  intervals: BusyOccurrenceInterval[];
  truncated: boolean;
}

export async function queryBusyOccurrences(
  deps: BusyQueryDeps,
  input: BusyQueryInput,
): Promise<BusyOccurrenceQueryResult> {
  const { intervals: occurrences, truncated } =
    await deps.occurrences.listBusyOverlapping({
      tenantId: input.tenantId,
      principalId: input.principalId,
      calendars: input.calendars,
      start: input.start,
      end: input.end,
      limit: input.limit,
    });

  const windowStart = input.start.getTime();
  const windowEnd = input.end.getTime();
  const excluded = new Set(input.excludeEventIds ?? []);
  const intervals = occurrences
    .map((occurrence) => ({
      start:
        occurrence.startAt.getTime() > windowStart
          ? occurrence.startAt
          : input.start,
      end:
        occurrence.endAt.getTime() < windowEnd ? occurrence.endAt : input.end,
      eventId: occurrence.eventId,
    }))
    .filter(
      (interval) =>
        interval.end.getTime() > interval.start.getTime() &&
        !excluded.has(interval.eventId),
    );
  return { intervals, truncated };
}

export async function queryBusyIntervals(
  deps: BusyQueryDeps,
  input: BusyQueryInput,
): Promise<BusyInterval[]> {
  const { intervals } = await queryBusyOccurrences(deps, input);
  return mergeBusyIntervals(intervals);
}

// Why a requested calendar's busy data could not be freshly included.
export type CalendarFreshnessIssue =
  // No events resource for the calendar yet — it was never imported.
  | "notImported"
  // A resource exists but has not completed a successful sync yet.
  | "neverSynced"
  // Its last successful sync is older than the caller's acceptable age.
  | "stale";

export interface CalendarIssue {
  calendarId: SyncEventCalendarId;
  reason: CalendarFreshnessIssue;
}

// The freshness evidence for one connection backing a requested calendar. State
// and timestamps are reported as-is so the caller (not Sync) decides how to use
// them; `state === "healthy"` is the only state that permits booking.
export interface ConnectionFreshness {
  connectionId: ConnectionId;
  state: ConnectionState;
  lastSyncedAt: Date | null;
  lastHealthyAt: Date | null;
}

export interface BusyAvailability {
  // Merged busy intervals from every requested calendar that had data (including
  // stale ones — their staleness is disclosed in `issues`, not hidden).
  intervals: BusyInterval[];
  // When this result was computed, so the caller can reason about its own age.
  computedAt: Date;
  // Per-connection freshness for the connections backing the requested calendars.
  connections: ConnectionFreshness[];
  // Every requested calendar was present and within the acceptable age.
  complete: boolean;
  // The calendars that were missing or stale, with the reason for each.
  issues: CalendarIssue[];
  // Fresh enough to confirm a booking: complete AND every backing connection is
  // healthy. Fail-closed — anything unverified makes this false.
  bookable: boolean;
}

export interface BusyAvailabilityDeps {
  occurrences: EventOccurrenceRepository;
  events?: EventRepository;
  resources: SyncResourceRepository;
  connections: ProviderConnectionRepository;
  calendars: ProviderCalendarRepository;
}

export interface BusyAvailabilityInput {
  tenantId: TenantId;
  principalId: PrincipalId;
  // The blocking calendars whose busy data is requested.
  calendarIds: readonly SyncEventCalendarId[];
  // Compass-local ids the caller has already identified. Missing resources
  // outside this set stay notImported so a purged Google calendar cannot
  // fail open as empty Compass busy.
  unbackedCalendarIds?: readonly SyncEventCalendarId[];
  // Half-open query window [start, end).
  start: Date;
  end: Date;
  // The oldest a calendar's last successful sync may be and still count as fresh.
  maxAgeMs: number;
  now: Date;
  // Drop these events before merge. Unknown ids are ignored.
  excludeEventIds?: readonly EventId[];
  // Forwarded to the occurrence overlap read. Omit for the repository default.
  limit?: number;
}

// The busy intervals for a set of calendars plus the freshness/completeness
// evidence a caller needs to decide whether the result is safe to display or to
// confirm a booking against. Sync reports the facts; the booking policy (which
// calendars block, working hours, duration) is the caller's.
//
// A stale calendar's intervals are still returned (with its staleness disclosed)
// rather than dropped, so a display can show what is known while flagging it; a
// booking-confirmation caller sees `complete`/`bookable` go false and fails
// closed rather than booking over possibly-missed conflicts.
export async function computeBusyAvailability(
  deps: BusyAvailabilityDeps,
  input: BusyAvailabilityInput,
): Promise<BusyAvailability> {
  const now = input.now;
  const freshness = await deps.resources.listEventResourceFreshnessByCalendar(
    input.tenantId,
    input.principalId,
    input.calendarIds,
  );
  const providerCalendars = await deps.calendars.listByPrincipal(
    input.tenantId,
    input.principalId,
  );
  const providerCalendarIds = new Set(
    providerCalendars.map((calendar) => calendar._id as string),
  );
  const unbackedCalendarIds = new Set(input.unbackedCalendarIds ?? []);

  const present: CalendarGeneration[] = [];
  const issues: CalendarIssue[] = [];
  const backingConnectionIds = new Set<ConnectionId>();

  for (const calendarId of input.calendarIds) {
    const resource = freshness.get(calendarId);
    if (!resource) {
      if (
        unbackedCalendarIds.has(calendarId) &&
        !providerCalendarIds.has(calendarId)
      ) {
        // Compass-local calendar: events live in Sync with no provider resource.
        // Generation 0 is the only generation those writes ever use. Missing
        // occurrences are empty busy, not a freshness miss — fail closed only
        // when this query itself throws.
        present.push({
          calendarId,
          generation: UNBACKED_CALENDAR_GENERATION,
        });
        continue;
      }
      issues.push({ calendarId, reason: "notImported" });
      continue;
    }
    backingConnectionIds.add(resource.connectionId);
    if (resource.lastSuccessAt === null) {
      issues.push({ calendarId, reason: "neverSynced" });
      continue;
    }
    // Include its data even when stale — disclose the staleness, do not hide it.
    present.push({
      calendarId,
      generation: resource.activeGeneration,
    });
    const holdOffActive =
      resource.cursorExpiredBackoffUntil !== null &&
      now.getTime() <
        resource.cursorExpiredBackoffUntil.getTime() + HOLD_OFF_SWEEP_GRACE_MS;
    if (!holdOffActive) {
      const ageMs = now.getTime() - resource.lastSuccessAt.getTime();
      if (ageMs > input.maxAgeMs) {
        issues.push({ calendarId, reason: "stale" });
      }
    }
  }

  const raw = present.length
    ? await queryBusyOccurrences(
        { occurrences: deps.occurrences },
        {
          tenantId: input.tenantId,
          principalId: input.principalId,
          calendars: present,
          start: input.start,
          end: input.end,
          excludeEventIds: input.excludeEventIds,
          limit: input.limit,
        },
      )
    : { intervals: [] as BusyOccurrenceInterval[], truncated: false };
  const rawIntervals = raw.intervals;

  const eventsById = new Map<string, EventRecord>();
  if (deps.events && rawIntervals.length > 0) {
    const eventIds = [
      ...new Set(rawIntervals.map((interval) => interval.eventId)),
    ];
    const events = await deps.events.findByIds(
      input.tenantId,
      input.principalId,
      eventIds,
    );
    for (const event of events) {
      eventsById.set(event._id, event);
    }
  }

  // Freshness for exactly the connections backing the requested calendars.
  const allConnections = await deps.connections.listByPrincipal(
    input.tenantId,
    input.principalId,
  );
  const connections: ConnectionFreshness[] = allConnections
    .filter((c) => backingConnectionIds.has(c._id))
    .map((c) => ({
      connectionId: c._id,
      state: c.state,
      lastSyncedAt: c.lastSyncedAt,
      lastHealthyAt: c.lastHealthyAt,
    }));

  // Truncation means overlapping busy rows were dropped at the limit, so
  // completeness (and therefore bookable) must fail closed.
  const complete = issues.length === 0 && !raw.truncated;
  // Every backing connection must be present in storage AND healthy. A missing
  // connection record (referenced by a resource but not found) fails closed.
  const allBackingHealthy =
    connections.length === backingConnectionIds.size &&
    connections.every((c) => c.state === "healthy");
  const bookable = complete && allBackingHealthy;

  const emailByConnectionId = new Map(
    allConnections
      .filter((connection) => backingConnectionIds.has(connection._id))
      .map((connection) => [connection._id, connection.account.email]),
  );
  const fallbackEmail =
    [...emailByConnectionId.values()].find((email) => email !== null) ?? null;

  const intervals = mergeBusyIntervals(
    rawIntervals.map((interval) => {
      const event = eventsById.get(interval.eventId);
      const accountEmail =
        (event?.connectionId
          ? emailByConnectionId.get(event.connectionId)
          : undefined) ?? fallbackEmail;
      const facts = occupancyFactsForEvent(event, accountEmail);
      return {
        start: interval.start,
        end: interval.end,
        hostIsOrganizer: facts.hostIsOrganizer,
        hostResponseStatus: facts.hostResponseStatus,
      };
    }),
  );

  return {
    intervals,
    computedAt: now,
    connections,
    complete,
    issues,
    bookable,
  };
}
