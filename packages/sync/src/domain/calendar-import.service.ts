import { toColorLabelMap } from "@sync/domain/color-label-map";
import { syncHorizon } from "@sync/domain/horizon";
import { listEventPageWithAuthRetry } from "@sync/domain/list-event-page-with-auth-retry";
import { ProviderPageApplier } from "@sync/domain/provider-page-applier";
import { type AccessTokenSource } from "@sync/domain/provider-write-ladder";
import {
  type EventWindow,
  type ProviderEventReader,
} from "@sync/providers/provider-event-reader.port";
import { type ProviderCalendarRecord } from "@sync/storage/contracts/provider-calendar.contracts";
import { type SyncResourceRecord } from "@sync/storage/contracts/sync-resource.contracts";
import { type EventRepository } from "@sync/storage/repositories/event.repository";
import { type EventOccurrenceRepository } from "@sync/storage/repositories/event-occurrence.repository";
import { type SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";

export interface CalendarImportDeps {
  events: EventRepository;
  occurrences: EventOccurrenceRepository;
  resources: SyncResourceRepository;
  reader: ProviderEventReader;
  custody: AccessTokenSource;
}

export interface CalendarImportResult {
  resource: SyncResourceRecord;
  // Distinct events written this run (masters, singles, and linked exceptions —
  // overrides and cancelled tombstones), counted once regardless of how many
  // passes or retries touched each.
  imported: number;
  // Events dropped: unusable reads the reader skipped, plus series members whose
  // master never appeared (a provider anomaly).
  skipped: number;
}

// Import one provider calendar's events until the resource holds a durable
// incremental cursor.
//
// Two passes drive the reader. A WINDOWED pass over the rolling horizon runs
// first so the user's useful range appears quickly; it cannot yield a cursor
// (providers forbid combining a window with one), so a FULL unwindowed pass
// follows, checkpointing the page token in the sync resource after each page
// commits — a crash resumes from the checkpoint instead of restarting. The
// incremental cursor is committed only after the full pass and every projection
// it implies have completed, so the cursor never advances past uncommitted
// data. Every write is an idempotent provider-identity upsert and every
// projection replaces per (event, generation), so re-running any prefix
// converges.
//
// A deleted occurrence of an otherwise-active series comes back from a full
// list (showDeleted) as a cancellation carrying its series link; it is written
// as a cancelled exception so the master's expansion excludes that instant,
// never resurrecting the deleted occurrence.
//
// Ordering hazards handled:
// - A series MEMBER (a modified instance or a cancelled occurrence) can arrive
//   before its master (providers return events in arbitrary order). Unresolved
//   members are buffered and retried after each page and once more at the end
//   of each pass; a member whose master never appears is counted skipped. Named
//   wart: a buffered cross-page member is lost if the process crashes after its
//   own page was checkpointed but before its master arrived — bounded to one
//   exception, and repair or an incremental pull re-delivers it.
// - A master's projection must exclude the instants its exceptions own, and an
//   exception can land pages after its master. Masters therefore reproject
//   from a fresh exception read every time one of their exceptions links, and
//   projections for a page run BEFORE that page's checkpoint so a resumed run
//   never skips them.
export async function importCalendarEvents(
  deps: CalendarImportDeps,
  calendar: ProviderCalendarRecord,
  now: () => Date,
  options?: {
    // Fired once after the horizon windowed pass commits (fresh starts only).
    // Lets Sync notify the browser so the current week can paint before the
    // full unwindowed scrape finishes.
    onWindowedPassComplete?: () => Promise<void>;
  },
): Promise<CalendarImportResult> {
  const resource = await deps.resources.ensure({
    tenantId: calendar.tenantId,
    principalId: calendar.principalId,
    connectionId: calendar.connectionId,
    resourceKind: "events",
    calendarId: calendar._id,
  });

  // A cursor means the initial import already completed; incremental pulls own
  // this resource from here.
  if (resource.syncCursor !== null) {
    return { resource, imported: 0, skipped: 0 };
  }

  // Stamp BEFORE the token fetch can throw. Same reasoning as
  // calendar-pull.service.ts: the reconcile sweep selects least-recently-
  // attempted resources, so a doomed connection's import must rotate to the
  // back after failing, not tie at null forever and keep winning sweep slots
  // (2026-07-29: this exact ordering bug in the import path — not yet caught
  // by the pull-path fix — kept the same ~100 credential-less resources at
  // the sweep's head after that fix had already shipped).
  await deps.resources.markAttempt(
    resource.tenantId,
    resource.principalId,
    resource._id,
    now(),
  );
  const accessToken = await deps.custody.getValidAccessToken(
    calendar.connectionId,
  );

  const run = new ImportRun(deps, calendar, resource, now, accessToken);

  // The windowed fast pass only runs on a fresh start — a resume mid-full-pass
  // already imported the window, and redoing it would only repeat work.
  if (resource.pageCursor === null) {
    await run.readPass({ window: horizonWindow(now()) });
    if (options?.onWindowedPassComplete) {
      await options.onWindowedPassComplete();
    }
  }

  const syncCursor = await run.readPass({
    checkpointed: true,
    resumeFrom: resource.pageCursor,
  });
  await run.resolveRemainingInstances();

  if (!syncCursor) {
    // Without a cursor the resource can never go incremental; surfacing this
    // loudly beats silently re-importing forever.
    throw new Error(
      "Provider returned no sync cursor after a full unwindowed pass",
    );
  }
  await deps.resources.advanceCursor(
    resource.tenantId,
    resource.principalId,
    resource._id,
    syncCursor,
    now(),
  );

  const updated = await deps.resources.findById(
    resource.tenantId,
    resource.principalId,
    resource._id,
  );
  return {
    resource: updated ?? resource,
    imported: run.imported,
    skipped: run.skipped,
  };
}

// Drives the reader through one import's passes over one calendar. The shared
// ProviderPageApplier does the per-page content work (upsert, link, project)
// and spans both passes so a full-pass event whose etag/updated matches the
// windowed write is not re-upserted. This run owns import-specific control:
// the checkpointed page loop, the windowed-vs-full distinction, reader-drop
// counting, and the final flush.
// A standalone cancellation has no local event to tombstone on a first import,
// so the applier's returned deletions are ignored.
class ImportRun {
  #applier: ProviderPageApplier;
  // Reader-dropped reads on the full pass only; the windowed pass sees a subset
  // the full pass re-reads, so counting both double-counts.
  #readerSkipped = 0;
  #orphans = 0;

  #accessToken: string;

  constructor(
    private readonly deps: CalendarImportDeps,
    private readonly calendar: ProviderCalendarRecord,
    private readonly resource: SyncResourceRecord,
    now: () => Date,
    accessToken: string,
  ) {
    this.#accessToken = accessToken;
    // Import writes the active (live) generation — the one reads serve. Only a
    // repair stages a separate importGeneration; the first import runs with
    // active and import both at 0, so it populates the generation reads serve.
    this.#applier = new ProviderPageApplier(
      deps.events,
      deps.occurrences,
      calendar,
      resource.activeGeneration,
      now,
    );
  }

  get imported(): number {
    return this.#applier.importedCount;
  }
  get skipped(): number {
    return this.#readerSkipped + this.#orphans;
  }

  // Drive the reader through one pass. Returns the provider's sync cursor when
  // the pass produced one (only an unwindowed pass can).
  async readPass(options: {
    window?: EventWindow;
    checkpointed?: boolean;
    resumeFrom?: string | null;
  }): Promise<string | null> {
    let pageToken: string | null = options.resumeFrom ?? null;
    let syncCursor: string | null = null;

    do {
      const read = await listEventPageWithAuthRetry(
        this.deps,
        this.calendar.connectionId,
        {
          accessToken: this.#accessToken,
          calendarId: this.calendar.providerCalendarId,
          window: options.window ?? null,
          pageToken,
          colorLabels: toColorLabelMap(this.calendar.eventLabels),
        },
      );
      this.#accessToken = read.accessToken;
      const page = read.page;
      if (options.checkpointed) this.#readerSkipped += page.skipped;
      // A first import has no local events to delete, so standalone
      // cancellations the applier returns are discarded.
      await this.#applier.applyPage(page.events);

      pageToken = page.nextPageToken;
      syncCursor = page.nextSyncToken ?? syncCursor;
      // The checkpoint is the durability barrier: it moves only after the
      // page's upserts AND projections committed, so a crash-resume re-reads
      // at most one already-applied (idempotent) page.
      if (options.checkpointed && pageToken) {
        await this.deps.resources.setPageCheckpoint(
          this.resource.tenantId,
          this.resource.principalId,
          this.resource._id,
          pageToken,
        );
      }
    } while (pageToken);

    return syncCursor;
  }

  // Flush any series members still waiting for a master, counting the ones that
  // never linked as skipped provider anomalies.
  async resolveRemainingInstances(): Promise<void> {
    this.#orphans += (await this.#applier.finish()).orphans;
  }
}

// The rolling horizon as an RFC3339 window for the fast first pass.
function horizonWindow(now: Date): EventWindow {
  const horizon = syncHorizon(now);
  return {
    timeMin: horizon.start.toISOString(),
    timeMax: horizon.end.toISOString(),
  };
}
