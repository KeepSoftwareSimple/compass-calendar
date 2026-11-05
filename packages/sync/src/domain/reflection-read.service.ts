import { type Db, type Filter } from "mongodb";
import { type DateTime } from "@core/types/domain-primitives";
import {
  type PrincipalId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import {
  type ReflectionReadRequest,
  type ReflectionReadResponse,
} from "@core/types/sync/reflection.contracts";
import { projectOccurrences } from "@sync/domain/occurrence-projection";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import {
  EventReadSchema,
  type EventRecord,
} from "@sync/storage/contracts/event.contracts";
import { EventRepository } from "@sync/storage/repositories/event.repository";
import { ProviderCalendarRepository } from "@sync/storage/repositories/provider-calendar.repository";
import { SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";

// Read canonical history in small pages; never widen the interactive horizon.
export async function readReflectionPage(
  db: Db,
  scope: { tenantId: TenantId; principalId: PrincipalId },
  input: ReflectionReadRequest,
): Promise<ReflectionReadResponse> {
  const calendars = await new ProviderCalendarRepository(db).listByPrincipal(
    scope.tenantId,
    scope.principalId,
  );
  const active = new Set(
    calendars
      .filter((calendar) => calendar.active)
      .map((calendar) => String(calendar._id)),
  );
  const knownProvider = new Set(
    calendars.map((calendar) => String(calendar._id)),
  );
  const resources = await new SyncResourceRepository(db).listEventsByPrincipal(
    scope.tenantId,
    scope.principalId,
  );
  const calendarIds = input.calendarIds.filter(
    (id) => !knownProvider.has(id) || active.has(id),
  );
  const relevant = calendars.filter((calendar) =>
    calendarIds.includes(calendar._id),
  );
  const historyComplete = relevant.every((calendar) =>
    resources.some(
      (resource) =>
        resource.calendarId === calendar._id &&
        resource.historyCoverageVersion === 1 &&
        resource.activeGeneration === resource.importGeneration &&
        resource.bootstrapState === "ready",
    ),
  );
  const collection = db.collection<EventRecord>(SYNC_COLLECTIONS.events);
  const filter = {
    tenantId: scope.tenantId,
    principalId: scope.principalId,
    calendarId: { $in: calendarIds },
    lifecycleState: "active" as const,
  };
  const oldest = await collection
    .find(filter)
    .sort({ "schedule.start": 1 })
    .limit(1)
    .next();
  // Canonical history can contain decades of unrelated single events. Keep
  // masters for historical recurrence expansion, but only read single/exception
  // schedules that could overlap a requested window. Two days of padding keep
  // these string date comparisons conservative across all-day dates and offsets;
  // projectOccurrences remains the exact overlap authority.
  const bounds = input.windows.map((window) => ({
    start: new Date(
      Math.min(Date.parse(window.startDate), Date.parse(window.start)) -
        2 * 86_400_000,
    )
      .toISOString()
      .slice(0, 10),
    end: new Date(
      Math.max(Date.parse(window.endDate), Date.parse(window.end)) +
        2 * 86_400_000,
    )
      .toISOString()
      .slice(0, 10),
  }));
  const latestEnd = bounds
    .map((bound) => bound.end)
    .sort()
    .at(-1);
  const rows: EventRecord[] = [];
  if (latestEnd) {
    // Separate masters from scheduled facts so each query can bound the
    // kind/start index. One union with a page-index hint scans the whole
    // archive for sparse years; unhinted unions spend the deadline planning.
    const candidates: Filter<EventRecord>[] = [
      {
        "recurrence.kind": "seriesMaster",
        "schedule.start": { $lt: latestEnd },
      },
      {
        "recurrence.kind": { $in: ["single", "exception"] },
        $or: bounds.map((bound) => ({
          "schedule.start": { $gte: bound.start, $lt: bound.end },
        })),
      },
    ];
    const pages = await Promise.all(
      candidates.map((candidate) =>
        collection
          .find({
            ...filter,
            ...candidate,
            ...(input.cursor
              ? { _id: { $gt: input.cursor as EventRecord["_id"] } }
              : {}),
          })
          .hint("reflection_principal_kind_start")
          .sort({ _id: 1 })
          .limit(25)
          .toArray(),
      ),
    );
    // Both disjoint streams share the same exclusive cursor. Their first 25
    // contain the union's first 25. UTF-8 comparison matches Mongo's ID order.
    rows.push(
      ...pages
        .flat()
        .sort((a, b) => Buffer.compare(Buffer.from(a._id), Buffer.from(b._id)))
        .slice(0, 25),
    );
  }
  const records = rows.map((row) => EventReadSchema.parse(row));
  const exceptions = await new EventRepository(
    db,
  ).findSeriesExceptionsBySeriesIds(
    scope.tenantId,
    scope.principalId,
    records
      .filter((record) => record.recurrence.kind === "seriesMaster")
      .map((record) => record._id),
  );
  const selfEmails = new Set(
    input.selfEmails.map((email) => email.toLowerCase()),
  );
  const events: ReflectionReadResponse["events"] = [];
  let truncated = false;
  for (const event of records) {
    if (
      event.content.attendees.some(
        (attendee) =>
          selfEmails.has(attendee.email.toLowerCase()) &&
          attendee.responseStatus === "declined",
      )
    )
      continue;
    const excluded = (exceptions.get(event._id) ?? []).flatMap((exception) =>
      exception.recurrence.kind === "exception"
        ? [exception.recurrence.recurrenceId as DateTime]
        : [],
    );
    for (const window of input.windows) {
      const horizon =
        event.schedule.kind === "allDay"
          ? {
              start: new Date(`${window.startDate}T00:00:00Z`),
              end: new Date(`${window.endDate}T00:00:00Z`),
            }
          : { start: new Date(window.start), end: new Date(window.end) };
      let occurrences: ReturnType<typeof projectOccurrences>;
      try {
        occurrences = projectOccurrences(event, horizon, excluded, 50_000);
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        truncated = true;
        continue;
      }
      // Refuse to silently truncate exceptionally dense recurrence rules.
      if (occurrences.length >= 1000) truncated = true;
      for (const occurrence of occurrences) {
        if (occurrence.cancelled) continue;
        if (events.length >= 10_000) {
          truncated = true;
          break;
        }
        events.push({
          id: occurrence.occurrenceKey,
          eventId: event._id,
          seriesId:
            event.recurrence.kind === "exception"
              ? event.recurrence.seriesId
              : null,
          calendarId: event.calendarId,
          title: event.customizations?.title ?? event.content.title,
          schedule: occurrence.schedule,
          recurring: event.recurrence.kind !== "single",
          uid:
            event.providerMetadata?.["icalUid"] ??
            event.providerMetadata?.["uid"] ??
            null,
          windowKey: window.key,
        });
      }
    }
  }
  const last = records.at(-1);
  return {
    events,
    nextCursor: records.length === 25 && last ? last._id : null,
    oldestYear: oldest ? Number(oldest.schedule.start.slice(0, 4)) : null,
    historyComplete,
    truncated,
  };
}
