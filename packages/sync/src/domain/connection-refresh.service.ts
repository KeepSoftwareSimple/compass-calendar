import {
  type PrincipalId,
  type TenantId,
  TenantIdSchema,
} from "@core/types/sync/identity.contracts";
import { FOREGROUND_CALENDAR_LIST_STALE_AFTER_MS } from "@sync/domain/calendar-list-rediscovery.constants";
import {
  calendarListSyncJob,
  JOB_PRIORITY,
  resourceJob,
} from "@sync/storage/contracts/job.contracts";
import { type JobRepository } from "@sync/storage/repositories/job.repository";
import { type ProviderConnectionRepository } from "@sync/storage/repositories/provider-connection.repository";
import { type SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";
import { mapWithConcurrency } from "@sync/util/map-with-concurrency";

// A resource pulled this recently does not need a fallback nudge; see
// listStaleEventsByPrincipal for why this compares attempt, not success, time.
const FOREGROUND_STALE_AFTER_MS = 30_000;
// Bounds on the two nested fan-outs below. Their product is the ceiling on
// simultaneous enqueue workflows for one batch, and therefore on the Mongo
// load a foreground tick can put behind webhook-driven work.
const FOREGROUND_PRINCIPAL_CONCURRENCY = 10;
const FOREGROUND_ENQUEUE_CONCURRENCY = 10;

export interface ConnectionRefreshDeps {
  resources: SyncResourceRepository;
  jobs: JobRepository;
  connections: Pick<ProviderConnectionRepository, "listByPrincipal">;
}

export interface ForegroundRefreshDeps {
  resources: Pick<
    SyncResourceRepository,
    "listStaleEventsByPrincipal" | "listByConnection" | "clearSyncCursor"
  >;
  jobs: Pick<JobRepository, "enqueueForeground">;
  connections: Pick<ProviderConnectionRepository, "listByPrincipal">;
}

export type ConnectionRefreshTally = {
  resources: number;
  created: number;
  boosted: number;
  requeuedFailed: number;
  inFlight: number;
};

const emptyTally = (): ConnectionRefreshTally => ({
  resources: 0,
  created: 0,
  boosted: 0,
  requeuedFailed: 0,
  inFlight: 0,
});

// Both refresh endpoints report the same three numbers. Foreground never
// revives a failed job, so its requeuedFailed is structurally 0 and this stays
// a faithful total for either caller.
export function toConnectionRefreshResponse(tally: ConnectionRefreshTally) {
  return {
    enqueued: tally.created + tally.boosted + tally.requeuedFailed,
    inFlight: tally.inFlight,
    resources: tally.resources,
  };
}

/**
 * Enqueue (or boost) an incremental pull for every events resource owned by
 * the principal. Uses enqueueUrgent so a repeat Refresh pulls runAfter forward
 * and raises priority; coalesces with webhook/reconcile pulls on the same key
 * so work already in flight is reported rather than double-started.
 * Resources without a sync cursor become `initialImport` via the pull
 * dispatch followup (`notImported`).
 */
export async function refreshPrincipalCalendars(
  deps: ConnectionRefreshDeps,
  tenantId: TenantId,
  principalId: PrincipalId,
  now: () => Date = () => new Date(),
): Promise<ConnectionRefreshTally> {
  const [resources, connectionRecords] = await Promise.all([
    deps.resources.listEventsByPrincipal(tenantId, principalId),
    deps.connections.listByPrincipal(tenantId, principalId),
  ]);
  const runAfter = now();
  const tally: ConnectionRefreshTally = {
    ...emptyTally(),
    resources: resources.length,
  };

  // Revive every failed job (of any kind) for each connection this refresh
  // touches, not just the incrementalPull rows enqueueUrgent below revives via
  // coalescing key. Otherwise a wedged calendarListSync/initialImport/repair/
  // subscriptionMaintain row stays stuck even after the user asks to refresh.
  // Union connection rows with events-resource owners so a connection whose
  // calendars have no events resource (the missing-resource trap) still
  // requeues and re-runs discovery.
  const connectionIds = [
    ...new Set([
      ...connectionRecords.map((connection) => connection._id),
      ...resources.map((r) => r.connectionId),
    ]),
  ];
  const revivedCounts = await Promise.all(
    connectionIds.map((connectionId) =>
      deps.jobs.requeueFailedByConnection(
        tenantId,
        principalId,
        connectionId,
        runAfter,
      ),
    ),
  );
  tally.requeuedFailed += revivedCounts.reduce((sum, n) => sum + n, 0);

  // Re-run calendar-list discovery per connection so a Refresh heals
  // resource-less calendars (discovery creates the missing events resource
  // and enqueues its import). Clear the stored incremental cursor first so
  // this pass full-lists (Google incremental tokens can miss a brand-new
  // calendar; Microsoft has no list delta but shares the same fullList gate
  // for retirement). Coalesced per connection at user priority.
  await Promise.all(
    connectionIds.map(async (connectionId) => {
      const connectionResources = await deps.resources.listByConnection(
        tenantId,
        principalId,
        connectionId,
      );
      const calendarList = connectionResources.find(
        (resource) => resource.resourceKind === "calendarList",
      );
      if (calendarList) {
        await deps.resources.clearSyncCursor(
          tenantId,
          principalId,
          calendarList._id,
        );
      }
      await deps.jobs.enqueueUrgent(
        calendarListSyncJob(
          { tenantId, principalId, connectionId },
          runAfter,
          JOB_PRIORITY.user,
        ),
      );
    }),
  );

  const outcomes = await Promise.all(
    resources.map(async (resource) => {
      const { outcome } = await deps.jobs.enqueueUrgent(
        resourceJob(resource, "incrementalPull", runAfter, JOB_PRIORITY.user),
      );
      return outcome;
    }),
  );
  for (const outcome of outcomes) {
    tally[outcome] += 1;
  }
  return tally;
}

/**
 * Bound staleness for a principal actively viewing Compass when a Google push
 * notification is lost. Unlike the manual refresh path this only touches
 * ready resources that have not recently attempted a pull. Also re-lists
 * calendar lists that have not had a full enumeration recently so Microsoft
 * accounts pick up new folders while the tab stays open (no Graph list watch).
 */
export async function refreshStalePrincipalCalendars(
  deps: ForegroundRefreshDeps,
  tenantId: TenantId,
  principalId: PrincipalId,
  staleBefore: Date,
  now: () => Date = () => new Date(),
): Promise<ConnectionRefreshTally> {
  const at = now();
  const [candidates, connections] = await Promise.all([
    deps.resources.listStaleEventsByPrincipal(
      tenantId,
      principalId,
      staleBefore,
    ),
    deps.connections.listByPrincipal(tenantId, principalId),
  ]);
  const refreshableConnections = connections.filter(
    (connection) =>
      connection.state === "healthy" || connection.state === "delayed",
  );
  const refreshableConnectionIds = new Set(
    refreshableConnections.map((connection) => connection._id),
  );
  const resources = candidates.filter((resource) =>
    refreshableConnectionIds.has(resource.connectionId),
  );
  const runAfter = at;
  const listStaleBefore = new Date(
    at.getTime() - FOREGROUND_CALENDAR_LIST_STALE_AFTER_MS,
  );
  await Promise.all(
    refreshableConnections.map(async (connection) => {
      const connectionResources = await deps.resources.listByConnection(
        tenantId,
        principalId,
        connection._id,
      );
      const calendarList = connectionResources.find(
        (resource) => resource.resourceKind === "calendarList",
      );
      const needsList =
        !calendarList?.lastFullListAt ||
        calendarList.lastFullListAt < listStaleBefore;
      if (!needsList) return;
      if (calendarList) {
        await deps.resources.clearSyncCursor(
          tenantId,
          principalId,
          calendarList._id,
        );
      }
      // One coalescingKey per connection (`calendarListSync:<connectionId>`),
      // so duplicate foreground ticks, backend replicas, or many tabs on the
      // same account share a single pending/in-flight list job instead of
      // multiplying Graph/Google list calls.
      await deps.jobs.enqueueForeground(
        calendarListSyncJob(
          { tenantId, principalId, connectionId: connection._id },
          runAfter,
          JOB_PRIORITY.user,
        ),
      );
    }),
  );
  const tally: ConnectionRefreshTally = {
    ...emptyTally(),
    resources: resources.length,
  };
  const outcomes = await mapWithConcurrency(
    resources,
    FOREGROUND_ENQUEUE_CONCURRENCY,
    async (resource) => {
      const { outcome } = await deps.jobs.enqueueForeground(
        resourceJob(resource, "incrementalPull", runAfter, JOB_PRIORITY.user),
      );
      return outcome;
    },
  );
  for (const outcome of outcomes) {
    if (outcome !== "failed") tally[outcome] += 1;
  }
  return tally;
}

/**
 * One foreground tick's worth of work: refresh every principal the backend
 * reports as holding an open Compass stream, and fold the per-principal
 * tallies into one. Both fan-outs are capped, so a maximum-size batch can
 * never put more than PRINCIPAL x ENQUEUE enqueue workflows on Mongo at once.
 */
export async function refreshStaleForegroundPrincipals(
  deps: ForegroundRefreshDeps,
  principalIds: readonly PrincipalId[],
  now: Date,
): Promise<ConnectionRefreshTally> {
  const staleBefore = new Date(now.getTime() - FOREGROUND_STALE_AFTER_MS);
  const tallies = await mapWithConcurrency(
    principalIds,
    FOREGROUND_PRINCIPAL_CONCURRENCY,
    (principalId) =>
      refreshStalePrincipalCalendars(
        deps,
        // A personal Compass tenant is keyed by the principal's own ObjectId.
        TenantIdSchema.parse(principalId),
        principalId,
        staleBefore,
        () => now,
      ),
  );
  const total = emptyTally();
  for (const tally of tallies) {
    total.resources += tally.resources;
    total.created += tally.created;
    total.boosted += tally.boosted;
    total.requeuedFailed += tally.requeuedFailed;
    total.inFlight += tally.inFlight;
  }
  return total;
}
