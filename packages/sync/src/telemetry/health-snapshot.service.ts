import { type Db } from "mongodb";
import {
  captureSafely,
  type PostHogCaptureClient,
} from "@core/logger/posthog-capture";
import { ConnectionStateSchema } from "@core/types/sync/connection.contracts";
import {
  SYNC_HEALTH_SNAPSHOT_EVENT,
  type SyncHealthSnapshot,
  SyncHealthSnapshotSchema,
} from "@core/types/sync/health.contracts";
import {
  type ConnectionId,
  type ProviderKind,
} from "@core/types/sync/identity.contracts";
import { type ProviderRegistry } from "@sync/providers/provider-registry";
import { type StructuredServiceIdentity } from "@sync/service-identity";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import { type SyncMongoService } from "@sync/storage/sync-mongo.service";

// Channels expiring within this window count as renewSoon (aligns with the
// subscription maintenance sweep).
export const HEALTH_SUBSCRIPTION_RENEW_BEFORE_MS = 24 * 60 * 60_000;
const FRESHNESS_SLO_MS = 30_000;
// Cap the in-process freshness sample so a huge deployment stays bounded.
const FRESHNESS_SAMPLE_LIMIT = 5_000;

const ZERO_SUBSCRIPTION_COUNTS: SyncHealthSnapshot["subscriptions"] = {
  healthy: 0,
  renewSoon: 0,
  expired: 0,
  missing: 0,
  neverNotified: 0,
};

export interface HealthSnapshotDeps {
  mongo: SyncMongoService;
  identity: StructuredServiceIdentity;
  registry: ProviderRegistry;
  now?: () => Date;
}

// Build one sanitized aggregate snapshot from Sync storage. Pure relative to
// PostHog — callers decide whether to emit.
export async function computeHealthSnapshotForProvider(
  deps: HealthSnapshotDeps,
  provider: ProviderKind,
): Promise<SyncHealthSnapshot> {
  const started = Date.now();
  const now = deps.now?.() ?? new Date();
  const db = deps.mongo.db;
  const hasChangeNotifications = deps.registry
    .get(provider)
    .capabilities.includes("changeNotifications");

  const [connections, jobs, subscriptions, freshness] = await Promise.all([
    countConnectionsByState(db, provider),
    summarizeJobs(db, now, provider),
    hasChangeNotifications
      ? summarizeSubscriptions(db, now, provider)
      : Promise.resolve({ ...ZERO_SUBSCRIPTION_COUNTS }),
    summarizeFreshness(db, now, provider),
  ]);

  return SyncHealthSnapshotSchema.parse({
    environment: deps.identity.environment,
    execution: deps.identity.execution,
    provider,
    service: "compass-sync",
    connections,
    jobs,
    subscriptions,
    freshness,
    computedAt: now.toISOString(),
    computeMs: Date.now() - started,
  });
}

export async function computeHealthSnapshots(
  deps: HealthSnapshotDeps,
): Promise<SyncHealthSnapshot[]> {
  return Promise.all(
    deps.registry
      .kinds()
      .map((provider) => computeHealthSnapshotForProvider(deps, provider)),
  );
}

export async function emitHealthSnapshot(input: {
  deps: HealthSnapshotDeps;
  client: PostHogCaptureClient | null;
}): Promise<SyncHealthSnapshot[]> {
  const snapshots = await computeHealthSnapshots(input.deps);
  for (const snapshot of snapshots) {
    await captureSafely(input.client, {
      event: SYNC_HEALTH_SNAPSHOT_EVENT,
      // One service-level distinct id — never a user id (R-SEC-04).
      distinctId: "compass-sync",
      properties: snapshot as unknown as Record<string, unknown>,
    });
  }
  return snapshots;
}

async function connectionIdsForProvider(
  db: Db,
  provider: ProviderKind,
): Promise<ConnectionId[]> {
  const rows = await db
    .collection(SYNC_COLLECTIONS.providerConnections)
    .find({ provider }, { projection: { _id: 1 } })
    .toArray();
  return rows.map((row) => String(row._id) as ConnectionId);
}

// The counters below read collections directly instead of going through the
// repositories, on purpose: a fleet gauge must keep reporting even when a doc
// fails contract parsing (schema drift is exactly the kind of problem the
// snapshot should surface, not crash on), and $group counts never need
// hydrated records.
async function countConnectionsByState(
  db: Db,
  provider: ProviderKind,
): Promise<SyncHealthSnapshot["connections"]> {
  const rows = await db
    .collection(SYNC_COLLECTIONS.providerConnections)
    .aggregate<{ _id: string; count: number }>([
      { $match: { provider } },
      { $group: { _id: "$state", count: { $sum: 1 } } },
    ])
    .toArray();

  const counts: SyncHealthSnapshot["connections"] = {
    connecting: 0,
    importing: 0,
    catchingUp: 0,
    healthy: 0,
    delayed: 0,
    actionRequired: 0,
    disconnected: 0,
  };
  for (const row of rows) {
    const state = ConnectionStateSchema.safeParse(row._id);
    if (!state.success) continue;
    counts[state.data] = row.count;
  }
  return counts;
}

async function summarizeJobs(
  db: Db,
  now: Date,
  provider: ProviderKind,
): Promise<SyncHealthSnapshot["jobs"]> {
  const connectionIds = await connectionIdsForProvider(db, provider);
  if (connectionIds.length === 0) {
    return { pending: 0, claimed: 0, failed: 0, oldestDueAgeMs: null };
  }

  const connectionFilter = { connectionId: { $in: connectionIds } };
  const collection = db.collection(SYNC_COLLECTIONS.jobs);
  const [pending, claimed, failed, oldestDue] = await Promise.all([
    collection.countDocuments({ ...connectionFilter, state: "pending" }),
    collection.countDocuments({ ...connectionFilter, state: "claimed" }),
    collection.countDocuments({ ...connectionFilter, state: "failed" }),
    collection.findOne(
      {
        ...connectionFilter,
        $or: [
          { state: "pending", runAfter: { $lte: now } },
          { state: "claimed", leaseExpiresAt: { $lt: now } },
        ],
      },
      { sort: { runAfter: 1 }, projection: { runAfter: 1 } },
    ),
  ]);

  const oldestDueAgeMs =
    oldestDue?.["runAfter"] instanceof Date
      ? Math.max(0, now.getTime() - oldestDue["runAfter"].getTime())
      : null;

  return { pending, claimed, failed, oldestDueAgeMs };
}

async function summarizeSubscriptions(
  db: Db,
  now: Date,
  provider: ProviderKind,
): Promise<SyncHealthSnapshot["subscriptions"]> {
  const connectionIds = await connectionIdsForProvider(db, provider);
  if (connectionIds.length === 0) {
    return { ...ZERO_SUBSCRIPTION_COUNTS };
  }

  const renewBefore = new Date(
    now.getTime() + HEALTH_SUBSCRIPTION_RENEW_BEFORE_MS,
  );
  const collection = db.collection(SYNC_COLLECTIONS.syncResources);
  const eventsFilter = {
    resourceKind: "events" as const,
    connectionId: { $in: connectionIds },
  };

  const [healthy, renewSoon, expired, missing, neverNotified] =
    await Promise.all([
      collection.countDocuments({
        ...eventsFilter,
        subscriptionId: { $ne: null },
        subscriptionExpiresAt: { $gte: renewBefore },
      }),
      collection.countDocuments({
        ...eventsFilter,
        subscriptionId: { $ne: null },
        subscriptionExpiresAt: { $gte: now, $lt: renewBefore },
      }),
      collection.countDocuments({
        ...eventsFilter,
        subscriptionId: { $ne: null },
        subscriptionExpiresAt: { $lt: now },
      }),
      collection.countDocuments({
        ...eventsFilter,
        subscriptionId: null,
      }),
      // pushLastReceivedAt, NOT changeNotifiedAt: the latter is a pending
      // marker the serving pull clears within seconds, so counting it reported
      // a fully unnotified fleet even while push was working perfectly.
      // `$eq: null` matches a missing field too, which is what a resource
      // predating the field looks like — deliberately counted, since such a
      // resource has equally never been observed receiving a push.
      //
      // Live channels only, the same population as healthy + renewSoon. The
      // push-delivery alarm compares this number against that population, so
      // an expired channel counted here is a phantom: staging fired the alarm
      // on 2026-09-09 with its one live channel receiving pushes fine, because
      // a dead connection's channel had expired unrenewed without ever being
      // notified and made neverNotified >= live on its own. Google cannot
      // notify an expired channel, so it says nothing about delivery.
      collection.countDocuments({
        ...eventsFilter,
        subscriptionId: { $ne: null },
        subscriptionExpiresAt: { $gte: now },
        pushLastReceivedAt: null,
      }),
    ]);

  return { healthy, renewSoon, expired, missing, neverNotified };
}

async function summarizeFreshness(
  db: Db,
  now: Date,
  provider: ProviderKind,
): Promise<SyncHealthSnapshot["freshness"]> {
  const connectionIds = await connectionIdsForProvider(db, provider);
  if (connectionIds.length === 0) {
    return {
      sampleSize: 0,
      p50Ms: null,
      p95Ms: null,
      p99Ms: null,
      percentOver30s: null,
    };
  }

  const rows = await db
    .collection(SYNC_COLLECTIONS.syncResources)
    .aggregate<{ lastSuccessAt: Date | null }>([
      {
        $match: {
          resourceKind: "events",
          lastSuccessAt: { $ne: null },
          connectionId: { $in: connectionIds },
        },
      },
      { $project: { lastSuccessAt: 1 } },
      { $sample: { size: FRESHNESS_SAMPLE_LIMIT } },
    ])
    .toArray();

  if (rows.length === 0) {
    return {
      sampleSize: 0,
      p50Ms: null,
      p95Ms: null,
      p99Ms: null,
      percentOver30s: null,
    };
  }

  const ages = rows
    .map((row) => {
      const at = row["lastSuccessAt"];
      return at instanceof Date ? now.getTime() - at.getTime() : null;
    })
    .filter((age): age is number => age !== null)
    .map((age) => Math.max(0, age))
    .sort((a, b) => a - b);

  if (ages.length === 0) {
    return {
      sampleSize: 0,
      p50Ms: null,
      p95Ms: null,
      p99Ms: null,
      percentOver30s: null,
    };
  }

  const over30 = ages.filter((age) => age > FRESHNESS_SLO_MS).length;
  return {
    sampleSize: ages.length,
    p50Ms: percentile(ages, 0.5),
    p95Ms: percentile(ages, 0.95),
    p99Ms: percentile(ages, 0.99),
    percentOver30s: Math.round((over30 / ages.length) * 1000) / 10,
  };
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 1) return sorted[0]!;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(p * sorted.length) - 1),
  );
  return sorted[index]!;
}
