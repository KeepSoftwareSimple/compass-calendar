import { toColorLabelMap } from "@sync/domain/color-label-map";
import { listEventPageWithAuthRetry } from "@sync/domain/list-event-page-with-auth-retry";
import { ProviderPageApplier } from "@sync/domain/provider-page-applier";
import { type AccessTokenSource } from "@sync/domain/provider-write-ladder";
import { type ProviderEventCancellation } from "@sync/providers/provider-event.port";
import {
  ProviderEventReadError,
  type ProviderEventReader,
} from "@sync/providers/provider-event-reader.port";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";
import { type ProviderCalendarRecord } from "@sync/storage/contracts/provider-calendar.contracts";
import { type SyncResourceRecord } from "@sync/storage/contracts/sync-resource.contracts";
import { type CommandRepository } from "@sync/storage/repositories/command.repository";
import { type EventRepository } from "@sync/storage/repositories/event.repository";
import { type EventOccurrenceRepository } from "@sync/storage/repositories/event-occurrence.repository";
import { type SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";

export interface CalendarPullDeps {
  events: EventRepository;
  occurrences: EventOccurrenceRepository;
  resources: SyncResourceRepository;
  commands: CommandRepository;
  reader: ProviderEventReader;
  custody: AccessTokenSource;
}

export type CalendarPullResult =
  | {
      // The pull applied the provider's changes and advanced the cursor.
      status: "applied";
      resource: SyncResourceRecord;
      changed: number;
      deleted: number;
      // A push notification for this calendar landed AFTER this pull had
      // already read the provider, so the change it announced is in neither
      // this pull nor any queued job (the enqueue coalesced onto this pull's
      // own claimed row). The caller must pull again rather than leave it to
      // the 15-minute reconcile sweep.
      changedDuringPull: boolean;
      // End-to-end push latency: provider notification to applied, in ms. Null
      // when this pull served no notification (a sweep or bootstrap pull).
      pushLatencyMs: number | null;
    }
  | {
      // The stored cursor is too old (410 Gone). The caller starts a full
      // repair (a later slice); this pull made no changes and left the cursor
      // untouched so the repair path decides what to do.
      status: "cursorExpired";
      resource: SyncResourceRecord;
    }
  | {
      // The resource has no cursor yet, so there is nothing to pull
      // incrementally — initial import owns it until it produces one.
      status: "notImported";
      resource: SyncResourceRecord;
    };

// Apply the provider's incremental changes for one already-imported calendar.
//
// Reads from the stored sync cursor (never a window — an incremental read is
// defined by the cursor alone), commits each page's writes and projections, and
// only advances the cursor after every page has committed, so a crash re-pulls
// from the old cursor rather than skipping changes. Every write is an idempotent
// provider-identity upsert and every projection replaces per (event,
// generation), so re-pulling a page converges.
//
// The shared ProviderPageApplier does the content work (upsert changed events,
// link series members, reproject touched series). This path adds what import
// does not: applying provider DELETIONS. A standalone cancellation (an event
// removed at the provider) deletes the local event — UNLESS an unacknowledged
// Compass command still targets it, in which case the local intent is preserved
// and left to reconcile rather than silently dropped.
export async function pullCalendarChanges(
  deps: CalendarPullDeps,
  calendar: ProviderCalendarRecord,
  now: () => Date,
): Promise<CalendarPullResult> {
  const resource = await deps.resources.ensure({
    tenantId: calendar.tenantId,
    principalId: calendar.principalId,
    connectionId: calendar.connectionId,
    resourceKind: "events",
    calendarId: calendar._id,
  });
  // Stamp the attempt FIRST — before the cursor check and before the token
  // fetch can throw. The reconcile sweep selects least-recently-attempted
  // resources, so a resource whose pull dies early (dead credential, never
  // imported) must still rotate to the back of the line. When this ran after
  // getValidAccessToken, ~100 credential-less resources were re-selected by
  // every sweep and starved the healthy backlog behind them (2026-07-29).
  await deps.resources.markAttempt(
    resource.tenantId,
    resource.principalId,
    resource._id,
    now(),
  );
  if (resource.syncCursor === null) {
    return { status: "notImported", resource };
  }

  // Read the change marker BEFORE the first provider read. Everything this pull
  // observes is a snapshot at or after this instant, so a marker still holding
  // this value at the end means no change arrived that this pull could have
  // missed. Any other value did arrive too late to be in the pages below.
  const notifiedAtStart = resource.changeNotifiedAt;

  let accessToken = await deps.custody.getValidAccessToken(
    calendar.connectionId,
  );

  // Write into the active (live) generation, not importGeneration: an
  // incremental pull edits what reads currently serve. Were it to target a
  // repair's staged importGeneration (bumped ahead but not yet active), its
  // occurrences would land in a generation reads ignore — new events would
  // vanish and provider deletions would leave phantoms until a repair completed.
  const applier = new ProviderPageApplier(
    deps.events,
    deps.occurrences,
    calendar,
    resource.activeGeneration,
    now,
  );
  // A pull resumes a mid-batch page from the stored page checkpoint; otherwise
  // it starts the batch at the stored incremental cursor.
  let pageToken = resource.pageCursor;
  let cursor = resource.syncCursor;
  let deleted = 0;
  const colorLabels = toColorLabelMap(calendar.eventLabels);
  const calendarDefaultPopupReminderMinutes =
    calendar.defaultPopupReminderMinutes ?? [];

  do {
    let page: Awaited<ReturnType<ProviderEventReader["listEventPage"]>>;
    try {
      const read = await listEventPageWithAuthRetry(
        deps,
        calendar.connectionId,
        {
          accessToken,
          calendarId: calendar.providerCalendarId,
          // The cursor applies only to the first request of a batch; paging then
          // continues by pageToken alone.
          cursor: pageToken === null ? cursor : null,
          pageToken,
          colorLabels,
          calendarDefaultPopupReminderMinutes,
        },
      );
      page = read.page;
      accessToken = read.accessToken;
    } catch (error) {
      // An expired cursor cannot be resumed; hand off to repair without
      // touching the stored cursor.
      if (
        error instanceof ProviderEventReadError &&
        error.reason === "cursorExpired"
      ) {
        return { status: "cursorExpired", resource };
      }
      throw error;
    }

    const standalone = await applier.applyPage(page.events);
    deleted += await applyDeletions(deps, calendar, standalone);

    pageToken = page.nextPageToken;
    cursor = page.nextSyncToken ?? cursor;
    // Checkpoint only after the page's writes, projections, and deletions have
    // committed, so a crash-resume re-reads at most one already-applied page.
    if (pageToken) {
      await deps.resources.setPageCheckpoint(
        resource.tenantId,
        resource.principalId,
        resource._id,
        pageToken,
      );
    }
  } while (pageToken);

  const { leftoverCancellations } = await applier.finish();
  // Series cancellations whose master never appeared (a sparse instance-shaped
  // id that was actually a standalone event) fall back to whole-event delete.
  deleted += await applyDeletions(deps, calendar, leftoverCancellations);
  await deps.resources.advanceCursor(
    resource.tenantId,
    resource.principalId,
    resource._id,
    cursor,
    now(),
  );

  // Retire the change this pull served — but only if nothing moved the marker
  // while the pages above were being read. A failed match is the signal that a
  // notification landed mid-pull; leave that newer marker in place so the next
  // pass owns it.
  const appliedAt = now();
  const served = await deps.resources.clearChangeNotifiedIfUnchanged(
    resource.tenantId,
    resource.principalId,
    resource._id,
    notifiedAtStart,
  );

  const updated = await deps.resources.findById(
    resource.tenantId,
    resource.principalId,
    resource._id,
  );
  return {
    status: "applied",
    resource: updated ?? resource,
    changed: applier.importedCount,
    deleted,
    changedDuringPull: !served,
    pushLatencyMs: notifiedAtStart
      ? appliedAt.getTime() - notifiedAtStart.getTime()
      : null,
  };
}

// Apply the provider deletions a page reported (its standalone cancellations).
// Each resolves to a local event by provider identity; a series master takes
// the whole series with it. An event with an unacknowledged Compass command is
// left alone — deleting it would drop a local edit still reconciling. Returns
// how many local events were removed.
async function applyDeletions(
  deps: CalendarPullDeps,
  calendar: ProviderCalendarRecord,
  cancellations: readonly ProviderEventCancellation[],
): Promise<number> {
  let deleted = 0;
  for (const cancellation of cancellations) {
    let event = await deps.events.findByProviderIdentity(
      calendar.tenantId,
      calendar.principalId,
      {
        connectionId: calendar.connectionId,
        calendarId: calendar._id,
        providerEventId: cancellation.providerEventId as NonNullable<
          EventRecord["providerEventId"]
        >,
      },
    );
    if (!event) {
      event = await deps.events.findByProviderResourceHref(
        calendar.tenantId,
        calendar.principalId,
        {
          connectionId: calendar.connectionId,
          calendarId: calendar._id,
          href: cancellation.providerEventId,
        },
      );
    }
    // Already gone (a prior pull removed it) or never stored — nothing to do.
    if (!event) continue;
    // A local edit/create is still in flight for this event; keep it so the
    // Compass intent reconciles against the provider rather than being lost.
    if (
      await deps.commands.hasNonterminalForEvent(
        event.tenantId,
        event.principalId,
        event._id,
      )
    ) {
      continue;
    }

    await deleteEventAndSeries(deps, event);
    deleted += 1;
  }
  return deleted;
}

// Remove a provider event locally. For a series master this also removes each
// exception (occurrences cleared before the record, so a crash never orphans
// occurrence rows — the same ordering the cloud series delete uses). An
// exception with an unacknowledged Compass command is preserved for the same
// reason a standalone event is: a per-occurrence edit still in flight must
// reconcile against the provider, not be silently dropped by the series cascade.
// That leaves it briefly master-less, which is safe — it projects only its own
// occurrence and its command resolves against the provider's now-gone series.
async function deleteEventAndSeries(
  deps: CalendarPullDeps,
  event: EventRecord,
): Promise<void> {
  if (event.recurrence.kind === "seriesMaster") {
    const exceptions = await deps.events.findSeriesExceptions(
      event.tenantId,
      event.principalId,
      event._id,
    );
    for (const exception of exceptions) {
      if (
        await deps.commands.hasNonterminalForEvent(
          exception.tenantId,
          exception.principalId,
          exception._id,
        )
      ) {
        continue;
      }
      await deps.occurrences.replaceForEvent(
        exception._id,
        exception.generation,
        [],
      );
      await deps.events.deleteById(
        exception.tenantId,
        exception.principalId,
        exception._id,
      );
    }
  }
  await deps.occurrences.replaceForEvent(event._id, event.generation, []);
  await deps.events.deleteById(event.tenantId, event.principalId, event._id);
}
