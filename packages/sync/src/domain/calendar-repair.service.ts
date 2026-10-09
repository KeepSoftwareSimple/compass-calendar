import { toColorLabelMap } from "@sync/domain/color-label-map";
import { listEventPageWithAuthRetry } from "@sync/domain/list-event-page-with-auth-retry";
import { ProviderPageApplier } from "@sync/domain/provider-page-applier";
import { type AccessTokenSource } from "@sync/domain/provider-write-ladder";
import { type ProviderEventReader } from "@sync/providers/provider-event-reader.port";
import { type ProviderCalendarRecord } from "@sync/storage/contracts/provider-calendar.contracts";
import { type SyncResourceRecord } from "@sync/storage/contracts/sync-resource.contracts";
import { type EventRepository } from "@sync/storage/repositories/event.repository";
import { type EventOccurrenceRepository } from "@sync/storage/repositories/event-occurrence.repository";
import { type SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";

export interface CalendarRepairDeps {
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
    }
  | {
      // The provider pass finished without a cursor, so the rebuild cannot be
      // trusted as complete. Reads stay on the old, intact generation; a later
      // repair resumes the same in-flight generation.
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
  let pageToken: string | null = null;
  let cursor: string | null = null;
  do {
    const read = await listEventPageWithAuthRetry(deps, calendar.connectionId, {
      accessToken,
      calendarId: calendar.providerCalendarId,
      pageToken,
      colorLabels,
      calendarDefaultPopupReminderMinutes,
    });
    const page = read.page;
    accessToken = read.accessToken;
    await applier.applyPage(page.events);
    pageToken = page.nextPageToken;
    cursor = page.nextSyncToken ?? cursor;
  } while (pageToken);
  await applier.finish();

  if (!cursor) {
    // No durable cursor means the rebuild can't be trusted complete. Leave the
    // old generation active and intact; the bumped importGeneration lets a later
    // repair resume this same generation.
    return { status: "incomplete", resource };
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
  await deps.events.deleteStaleProviderEventsBelowGeneration(
    calendar.tenantId,
    calendar.principalId,
    calendar._id,
    newGeneration,
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
  };
}
