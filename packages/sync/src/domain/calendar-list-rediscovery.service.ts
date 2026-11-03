import { enqueueForResources } from "@sync/domain/resource-sweep-enqueue";
import { calendarListSyncJob } from "@sync/storage/contracts/job.contracts";
import { type JobRepository } from "@sync/storage/repositories/job.repository";
import { type SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";

export interface CalendarListRediscoveryDeps {
  resources: SyncResourceRepository;
  jobs: JobRepository;
  // Called once per calendarList resource whose cursor could not be cleared or
  // job could not be enqueued. The sweep keeps going; the caller decides how
  // loud to be.
  onError?: (error: unknown, resourceId: string) => void;
}

// Force a FULL calendar-list re-discovery for every connection whose last full
// enumeration (lastFullListAt, NOT lastSuccessAt — see listStaleCalendarLists)
// is older than `before`, so a calendar deleted, hidden, or unshared at the
// provider eventually gets retired even though calendarListSync otherwise only
// ever runs incrementally.
//
// This is the guaranteed floor. The calendarList push route also clears the
// cursor, which converges within seconds — but only for connections that hold a
// live channel AND whose user actually changed something, so it cannot be the
// only mechanism.
//
// syncCalendarList decides full-vs-incremental purely from whether the stored
// cursor is null (`fullList = resource.syncCursor === null`), so clearing the
// cursor here is what forces the eventual pass to go full — it does not matter
// whether that pass is this sweep's own enqueue or one that coalesced onto an
// already-pending job; either reads the cleared cursor and full-lists. The
// cursor clear runs inside enqueueForResources's per-resource try/catch, so
// one doomed resource never abandons the rest of the batch.
export function rediscoverStaleCalendarLists(
  deps: CalendarListRediscoveryDeps,
  before: Date,
  now: () => Date,
  limit = 100,
): Promise<number> {
  return enqueueForResources(
    { jobs: deps.jobs, onEnqueueError: deps.onError },
    (b, l) => deps.resources.listStaleCalendarLists(b, l, now()),
    async (resource, nowFn) => {
      await deps.resources.clearSyncCursor(
        resource.tenantId,
        resource.principalId,
        resource._id,
      );
      return calendarListSyncJob(resource, nowFn());
    },
    before,
    now,
    limit,
  );
}
