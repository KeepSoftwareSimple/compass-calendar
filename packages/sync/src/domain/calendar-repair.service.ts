import { toColorLabelMap } from "@sync/domain/color-label-map";
import { listEventPageWithAuthRetry } from "@sync/domain/list-event-page-with-auth-retry";
import { ProviderPageApplier } from "@sync/domain/provider-page-applier";
import { type AccessTokenSource } from "@sync/domain/provider-write-ladder";
import { reprojectOccurrences } from "@sync/domain/reproject";
import {
  ProviderEventReadError,
  type ProviderEventReader,
} from "@sync/providers/provider-event-reader.port";
import { type EventRecord } from "@sync/storage/contracts/event.contracts";
import { type ProviderCalendarRecord } from "@sync/storage/contracts/provider-calendar.contracts";
import {
  hasCertifiedHistoryCoverage,
  type SyncResourceRecord,
} from "@sync/storage/contracts/sync-resource.contracts";
import { type CommandRepository } from "@sync/storage/repositories/command.repository";
import { type EventRepository } from "@sync/storage/repositories/event.repository";
import { type EventOccurrenceRepository } from "@sync/storage/repositories/event-occurrence.repository";
import { type SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";

export interface CalendarRepairDeps {
  commands?: Pick<CommandRepository, "nonterminalEventIds">;
  events: EventRepository;
  occurrences: EventOccurrenceRepository;
  resources: SyncResourceRepository;
  reader: ProviderEventReader;
  custody: AccessTokenSource;
}

export type CalendarRepairResult =
  | {
      // The rebuild completed: reads now serve the fresh generation and the old
      // one has been cleaned up.
      status: "repaired";
      resource: SyncResourceRecord;
      generation: number;
      imported: number;
      deleted: number;
      skipped: number;
    }
  | {
      // The provider pass could not be trusted as complete. Reads stay on the
      // active generation and a later attempt starts a fresh snapshot.
      status: "incomplete";
      resource: SyncResourceRecord;
    };

// Rebuild a provider calendar into a fresh occurrence generation and activate it
// atomically — a non-destructive repair for an invalid cursor or inconsistent
// stored state.
//
// The old generation stays the one reads serve for the entire rebuild, so the
// user never sees a half-built calendar; the new generation is built alongside
// it and only becomes visible on a single-field activation. On any failure the
// old generation is left active and intact — the repair simply does not
// activate.
//
// Crash-safe and idempotent. The new generation is chosen so a retry resumes the
// same in-flight one rather than bumping again (which would strand a partial
// generation): if a prior repair already advanced importGeneration past the
// active one, that generation is reused; otherwise a fresh generation starts.
// Every write is an idempotent provider-identity upsert into the new generation,
// so re-running the pass converges. Activation, cursor advance, and cleanup all
// run after the pass and are each idempotent, so a crash between them re-runs
// harmlessly.
export async function repairCalendar(
  deps: CalendarRepairDeps,
  calendar: ProviderCalendarRecord,
  now: () => Date,
): Promise<CalendarRepairResult> {
  const resource = await deps.resources.ensure({
    tenantId: calendar.tenantId,
    principalId: calendar.principalId,
    connectionId: calendar.connectionId,
    resourceKind: "events",
    calendarId: calendar._id,
  });

  // Stamp BEFORE the token fetch can throw — same reasoning as
  // calendar-pull.service.ts and calendar-import.service.ts: the reconcile
  // sweep selects least-recently-attempted resources, so a doomed
  // connection's repair must rotate to the back after failing, not tie at
  // null forever and keep winning sweep slots.
  await deps.resources.markAttempt(
    resource.tenantId,
    resource.principalId,
    resource._id,
    now(),
  );
  // A routine replacement retains its previously certified active archive.
  // Initial/legacy history stays uncertified until the complete pass succeeds.
  if (!hasCertifiedHistoryCoverage(resource)) {
    await deps.resources.recordHistoryCoverage(resource, 0, false, now());
  }

  // Reuse an in-flight repair generation (a previous attempt bumped it but never
  // activated) instead of starting yet another; otherwise begin a fresh one.
  const newGeneration =
    resource.importGeneration > resource.activeGeneration
      ? resource.importGeneration
      : await deps.resources.startNewGeneration(
          resource.tenantId,
          resource.principalId,
          resource._id,
        );

  let accessToken = await deps.custody.getValidAccessToken(
    calendar.connectionId,
  );

  // Rebuild the whole calendar into the new generation. A full unwindowed pass
  // (no cursor, no window) so the new generation is the provider's authoritative
  // current state; the final page yields the cursor incremental pulls resume
  // from. Standalone cancellations (events absent at the provider) are simply
  // not created in the new generation — their absence is the deletion.
  const applier = new ProviderPageApplier(
    deps.events,
    deps.occurrences,
    calendar,
    newGeneration,
    now,
  );
  const colorLabels = toColorLabelMap(calendar.eventLabels);
  const calendarDefaultPopupReminderMinutes =
    calendar.defaultPopupReminderMinutes ?? [];
  let pageToken: string | null = resource.repairPageCursor ?? null;
  let cursor: string | null = null;
  let skipped = resource.repairSkipped ?? 0;
  do {
    const read = await listEventPageWithAuthRetry(deps, calendar.connectionId, {
      accessToken,
      calendarId: calendar.providerCalendarId,
      pageToken,
      colorLabels,
      calendarDefaultPopupReminderMinutes,
    }).catch(async (error: unknown) => {
      if (
        pageToken &&
        error instanceof ProviderEventReadError &&
        error.reason === "cursorExpired"
      ) {
        // A provider page checkpoint can expire while an interrupted job waits.
        // Restart the staging snapshot on the next retry instead of replaying
        // that unusable checkpoint forever.
        await deps.resources.startNewGeneration(
          resource.tenantId,
          resource.principalId,
          resource._id,
        );
      }
      throw error;
    });
    const page = read.page;
    skipped += page.skipped;
    accessToken = read.accessToken;
    await applier.applyPage(page.events);
    pageToken = page.nextPageToken;
    cursor = page.nextSyncToken ?? cursor;
    if (pageToken && !applier.hasUnresolvedMembers) {
      await deps.resources.setRepairCheckpoint(resource, pageToken, skipped);
    }
  } while (pageToken);
  skipped += (await applier.finish({ fullSnapshot: true })).orphans;

  // One certification decision for the whole pass: a completed, gap-free read
  // from a reader that serves full history. Anything else revokes the archive
  // before activation/cleanup, so reads never flip onto an uncertified
  // generation. A transient failure before completion leaves the old archive.
  const certified =
    Boolean(cursor) &&
    skipped === 0 &&
    deps.reader.supportsFullHistory === true;
  if (!certified) {
    await deps.resources.recordHistoryCoverage(resource, skipped, false, now());
  }

  if (!cursor || (deps.reader.fullSnapshotOnly && skipped > 0)) {
    // An unusable completed pass must restart from the beginning, including
    // skipped records. A fresh staging generation prevents rows from this failed
    // snapshot surviving if the provider no longer returns them on the retry.
    await deps.resources.startNewGeneration(
      resource.tenantId,
      resource.principalId,
      resource._id,
    );
    return { status: "incomplete", resource };
  }

  // A snapshot must not erase local intent still waiting for provider work.
  // Promote and project pending events (and their series) before old-generation
  // cleanup, just as incremental pulls preserve events with pending commands.
  {
    const pending = deps.commands
      ? await deps.events.findByIds(
          calendar.tenantId,
          calendar.principalId,
          await deps.commands.nonterminalEventIds(
            calendar.tenantId,
            calendar.principalId,
          ),
        )
      : [];
    const local = await deps.events.findUnlinkedBelowGeneration(
      calendar.tenantId,
      calendar.principalId,
      calendar._id,
      newGeneration,
    );
    const retained = new Map<string, EventRecord>();
    for (const event of [...local, ...pending]) {
      if (event.calendarId !== calendar._id) continue;
      retained.set(event._id, event);
      if (event.recurrence.kind === "exception") {
        const master = await deps.events.findById(
          event.tenantId,
          event.principalId,
          event.recurrence.seriesId,
        );
        if (master) retained.set(master._id, master);
      }
    }
    for (const event of [...retained.values()]) {
      if (event.recurrence.kind !== "seriesMaster") continue;
      for (const exception of await deps.events.findSeriesExceptions(
        event.tenantId,
        event.principalId,
        event._id,
      ))
        retained.set(exception._id, exception);
    }
    for (const event of retained.values()) {
      if (event.generation >= newGeneration) continue;
      const promoted = await deps.events.promoteGeneration(
        event,
        newGeneration,
      );
      if (!promoted)
        throw new Error("Pending event changed during calendar snapshot");
      const exceptions =
        promoted.recurrence.kind === "seriesMaster"
          ? await deps.events.findSeriesExceptions(
              promoted.tenantId,
              promoted.principalId,
              promoted._id,
            )
          : [];
      await reprojectOccurrences(
        deps.occurrences,
        promoted,
        now,
        exceptions.flatMap((exception) =>
          exception.recurrence.kind === "exception"
            ? [exception.recurrence.recurrenceId]
            : [],
        ),
      );
    }
  }

  // Activate the new generation, then advance the cursor — reads flip in one
  // field update. Cleanup of the generations the repair replaced runs last, so a
  // crash before it leaves stale rows that reads already ignore and the next
  // cleanup removes.
  await deps.resources.activateGeneration(
    resource.tenantId,
    resource.principalId,
    resource._id,
    newGeneration,
  );
  await deps.resources.advanceCursor(
    resource.tenantId,
    resource.principalId,
    resource._id,
    cursor,
    now(),
  );
  await deps.occurrences.deleteByCalendarBelowGeneration(
    calendar.tenantId,
    calendar.principalId,
    calendar._id,
    newGeneration,
  );
  const deleted = await deps.events.deleteStaleProviderEventsBelowGeneration(
    calendar.tenantId,
    calendar.principalId,
    calendar._id,
    newGeneration,
  );
  await deps.resources.recordHistoryCoverage(
    resource,
    skipped,
    certified,
    now(),
  );

  const updated = await deps.resources.findById(
    resource.tenantId,
    resource.principalId,
    resource._id,
  );
  return {
    status: "repaired",
    resource: updated ?? resource,
    generation: newGeneration,
    imported: applier.importedCount,
    deleted,
    skipped,
  };
}
