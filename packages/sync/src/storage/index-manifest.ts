import {
  type CreateIndexesOptions,
  type Db,
  type IndexSpecification,
} from "mongodb";
import {
  SYNC_COLLECTIONS,
  type SyncCollectionName,
} from "@sync/storage/collections";

// Declarative index manifests for the `compass_sync` collections,
// drawn from the domain model's essential indexes. Installation is
// idempotent: MongoDB createIndex is a no-op when an identical index already
// exists, so re-running startup never errors. Repositories rely on
// these unique identities for atomic upserts and coalescing.

export interface IndexManifestEntry {
  readonly name: string;
  readonly key: IndexSpecification;
  readonly options?: CreateIndexesOptions;
}

export type IndexManifest = Record<SyncCollectionName, IndexManifestEntry[]>;

export const SYNC_INDEX_MANIFEST: IndexManifest = {
  [SYNC_COLLECTIONS.providerConnections]: [
    {
      name: "provider_account_identity",
      // account.providerAccountId is nested in the record — the index path must
      // match where the field actually lives, or every document keys on null.
      key: {
        tenantId: 1,
        principalId: 1,
        provider: 1,
        "account.providerAccountId": 1,
      },
      options: { unique: true },
    },
    { name: "principal_state", key: { principalId: 1, state: 1 } },
    { name: "health_age", key: { lastHealthyAt: 1 } },
    {
      // Retention sweep: soft-disconnected connections past the cache window.
      // Partial so live connections (disconnectedAt: null) stay out of the index.
      name: "disconnected_at",
      key: { disconnectedAt: 1 },
      options: {
        partialFilterExpression: { disconnectedAt: { $type: "date" } },
      },
    },
    {
      // Private support lookup by non-user-facing diagnostic key (S45).
      // Partial so pre-S45 rows without the field do not collide on null
      // while reads lazily stamp keys.
      name: "diagnostic_key",
      key: { diagnosticKey: 1 },
      options: {
        unique: true,
        partialFilterExpression: { diagnosticKey: { $type: "string" } },
      },
    },
  ],
  // Keyed 1:1 by connection id (the automatic _id index); no secondary indexes.
  [SYNC_COLLECTIONS.credentials]: [],
  [SYNC_COLLECTIONS.providerCalendars]: [
    {
      name: "connection_provider_calendar",
      key: { connectionId: 1, providerCalendarId: 1 },
      options: { unique: true },
    },
    { name: "principal_active", key: { principalId: 1, active: 1 } },
  ],
  [SYNC_COLLECTIONS.events]: [
    {
      name: "provider_event_identity",
      key: { connectionId: 1, calendarId: 1, providerEventId: 1 },
      // partialFilterExpression, not sparse: uniqueness must apply only to
      // genuinely provider-linked events. A sparse index would index an
      // unlinked event stored with providerEventId=null and then collide all
      // such events on (null,null,null) — allowing only one unlinked event.
      // Filtering on a real string providerEventId is robust whether the
      // repository stores unlinked provider fields as null or absent.
      //
      // PLANNER TRAP for every $type partial filter in this manifest: Mongo
      // only uses a partial index when the query provably implies its filter,
      // and a plain equality does NOT prove a $type predicate. Queries meant
      // to hit these indexes must assert the type themselves, e.g.
      // { providerEventId: { $eq: id, $type: "string" } } — semantically a
      // no-op, but without it the planner silently falls back to a COLLSCAN
      // (which is exactly what melted prod on this index).
      options: {
        unique: true,
        partialFilterExpression: { providerEventId: { $type: "string" } },
      },
    },
    { name: "principal_calendar", key: { principalId: 1, calendarId: 1 } },
    {
      name: "client_event_id",
      key: { principalId: 1, clientEventId: 1 },
      options: { sparse: true },
    },
    {
      // At most one exception per (owner, series, instant), so a scope-"this"
      // edit/delete upserts the same tombstone/override instead of racing two
      // in. Partial on the exception kind: only exception events carry a
      // recurrence.seriesId, and a non-exception would index as (null,null).
      name: "series_exception_identity",
      key: {
        tenantId: 1,
        principalId: 1,
        "recurrence.seriesId": 1,
        "recurrence.recurrenceId": 1,
      },
      options: {
        unique: true,
        partialFilterExpression: { "recurrence.kind": "exception" },
      },
    },
  ],
  [SYNC_COLLECTIONS.eventOccurrences]: [
    {
      // Unique per (event, instant) WITHIN a generation. The generation is part
      // of the key so a non-destructive repair can hold the same occurrence in
      // two generations at once (same event and occurrenceKey, different
      // generation) without colliding — the old generation stays readable while
      // the new one is built.
      name: "event_occurrence_generation",
      key: { eventId: 1, generation: 1, occurrenceKey: 1 },
      options: { unique: true },
    },
    // The range and busy-overlap reads filter each calendar to its active
    // generation, bound startAt (window plus BUSY_MAX_LOOKBACK_MS), and
    // filter endAt on the lookback/overlap branch. Indexing endAt after startAt
    // lets the planner reject non-overlapping lookback keys without fetching
    // them. A separate {calendarId, generation, endAt} index would skip
    // long-past ends too, but would scan every still-open future start and
    // cannot walk (startAt, _id) for keyset pagination.
    //
    // _id stays in the key for uniqueness. listByCalendarRange still sorts
    // (startAt, _id) explicitly so equal-startAt keyset order stays stable:
    // endAt sitting between those fields may add a SORT on the already
    // range-bounded, limited result.
    {
      name: "calendar_gen_start",
      key: { calendarId: 1, generation: 1, startAt: 1, endAt: 1, _id: 1 },
    },
    { name: "principal_start", key: { principalId: 1, startAt: 1 } },
  ],
  [SYNC_COLLECTIONS.syncResources]: [
    {
      name: "connection_resource_calendar",
      key: { connectionId: 1, resourceKind: 1, calendarId: 1 },
      options: { unique: true },
    },
    {
      // Owner-scoped calendar lookups (activeGenerationByCalendar,
      // listEventResourceFreshnessByCalendar) filter on
      // (tenantId, principalId, resourceKind, calendarId) — the unique
      // connection-led index above cannot serve that shape.
      name: "principal_resource_calendar",
      key: {
        tenantId: 1,
        principalId: 1,
        resourceKind: 1,
        calendarId: 1,
      },
    },
    {
      name: "subscription_expiry",
      key: { subscriptionExpiresAt: 1 },
      options: { sparse: true },
    },
    {
      // The public notification webhook looks a resource up by its channel id
      // on every inbound callback; sparse because most resources have none.
      name: "subscription_id",
      key: { subscriptionId: 1 },
      options: { sparse: true },
    },
    // Reconcile always filters resourceKind:"events" before lastSuccessAt /
    // lastAttemptAt, so lead with resourceKind to avoid walking every
    // calendarList row on each sweep. New names (not last_success /
    // last_attempt) so installIndexManifest drops the old single-field keys
    // instead of conflicting on same-name/different-spec.
    {
      name: "resource_last_success",
      key: { resourceKind: 1, lastSuccessAt: 1 },
    },
    {
      name: "resource_last_attempt",
      key: { resourceKind: 1, lastAttemptAt: 1 },
    },
    {
      // The bootstrap-recovery sweep's finder: lead with resourceKind (as
      // above), then bootstrapState so the common "ready" majority never
      // enters the updatedAt range scan.
      name: "resource_bootstrap_stalled",
      key: { resourceKind: 1, bootstrapState: 1, updatedAt: 1 },
    },
  ],
  [SYNC_COLLECTIONS.commands]: [
    {
      name: "idempotency_key",
      key: { tenantId: 1, principalId: 1, idempotencyKey: 1 },
      options: { unique: true },
    },
    { name: "event_state", key: { eventId: 1, "outcome.state": 1 } },
    { name: "pending_age", key: { createdAt: 1 } },
    // Covers the per-principal nonterminal queue drain (filter on state,
    // ordered oldest-first) so it's an index scan, not a collection scan.
    {
      name: "principal_nonterminal",
      key: { tenantId: 1, principalId: 1, "outcome.state": 1, createdAt: 1 },
    },
    // Covers the global stale-command retry sweep (listStaleNonterminal):
    // filter on state + kind, ordered oldest-first by updatedAt, across every
    // owner - deliberately NOT tenant/principal-scoped like the index above.
    {
      name: "stale_nonterminal",
      key: { "outcome.state": 1, "input.kind": 1, updatedAt: 1 },
    },
  ],
  [SYNC_COLLECTIONS.jobs]: [
    {
      name: "coalescing_key",
      key: { coalescingKey: 1 },
      options: { unique: true },
    },
    {
      // Due-job claim filters `{ state, runAfter: { $lte: now } }` (+ optional
      // priority residual). Leading with runAfter (not priority) means
      // pending-but-not-due backoff jobs are NOT examined — the previous
      // `{ state, priority, runAfter }` ordering walked every pending row on
      // every idle claim, which is what kept Atlas Query Targeting above 1000
      // after the events COLLSCAN fix (#2473). Priority is a claim-arm FILTER
      // (user rung before background), not a sort key; within a rung
      // oldest-due wins via `{ runAfter: 1 }` sort, which this index serves
      // directly (no SORT stage).
      name: "state_runafter_priority",
      key: { state: 1, runAfter: 1, priority: -1 },
    },
    {
      // Connection-state refresh asks for the oldest overdue job per connection
      // on every GET /internal/connections. Without a connection-led index that
      // is a jobs COLLSCAN per connection.
      name: "connection_runafter",
      key: { connectionId: 1, runAfter: 1 },
    },
    {
      // findOldestOverdueByConnection sorts retrying jobs by lastErrorAt.
      // Sparse because most jobs never record an error (null lastErrorAt).
      name: "connection_lasterrorat",
      key: { connectionId: 1, lastErrorAt: 1 },
      options: { sparse: true },
    },
    {
      name: "lease_expiry",
      key: { leaseExpiresAt: 1 },
      options: { sparse: true },
    },
  ],
  [SYNC_COLLECTIONS.deletionMarkers]: [
    {
      name: "provider_event_identity",
      key: { connectionId: 1, calendarId: 1, providerEventId: 1 },
      // Markers are always provider-linked, but filter on a real providerEventId
      // for the same robustness as the events index (never collide on nulls).
      options: {
        unique: true,
        partialFilterExpression: { providerEventId: { $type: "string" } },
      },
    },
    // TTL: content-free markers expire 30 days after deletion.
    {
      name: "ttl_expiry",
      key: { expiresAt: 1 },
      options: { expireAfterSeconds: 0 },
    },
  ],
  [SYNC_COLLECTIONS.invalidations]: [
    // Keyset resume for GET /internal/changes: filter by owner, page by _id.
    {
      name: "principal_id",
      key: { tenantId: 1, principalId: 1, _id: 1 },
    },
    // TTL: content-free invalidations expire after the retention window.
    {
      name: "ttl_expiry",
      key: { expiresAt: 1 },
      options: { expireAfterSeconds: 0 },
    },
  ],
};

// Creates every collection and its indexes idempotently. Safe to run on every
// startup and safe to run concurrently across replicas (Mongo serializes
// index/collection creation and treats an identical spec as a no-op).
export async function installIndexManifest(
  db: Db,
  manifest: IndexManifest = SYNC_INDEX_MANIFEST,
): Promise<void> {
  const existing = new Set(
    (await db.listCollections({}, { nameOnly: true }).toArray()).map(
      (c) => c.name,
    ),
  );

  for (const [collectionName, entries] of Object.entries(manifest)) {
    if (!existing.has(collectionName)) {
      // createCollection races harmlessly across replicas: a NamespaceExists
      // (48) from a concurrent creator is equivalent to success.
      await db
        .createCollection(collectionName)
        .catch((error: { code?: number }) => {
          if (error?.code !== 48) throw error;
        });
    }

    const collection = db.collection(collectionName);

    // Reconcile: the manifest is the source of truth, so drop any index it no
    // longer declares before (re)creating the ones it does. This lets an index
    // change its key under a new name — the old name is dropped here rather than
    // lingering and enforcing a stale (e.g. unique) constraint. Never touch the
    // built-in _id_ index. Safe while collections are empty (createIndex on a
    // renamed key would otherwise conflict with the old same-named index).
    //
    // OPERATIONAL CAVEAT: against a LARGE, POPULATED collection this is unsafe to
    // run inline at startup — dropping then rebuilding a unique index leaves a
    // window with no uniqueness enforced and blocks readiness on a foreground
    // build. Fine for today's jobs/sync_resources renames (small collections,
    // non-unique secondary indexes, createIndex finishes in seconds). A key
    // change on events/event_occurrences (hundreds of thousands of docs) must
    // move to a rolling/online index migration instead of this inline
    // drop-and-rebuild.
    const declared = new Set(entries.map((e) => e.name));
    const present = await collection.indexes().catch(() => []);
    for (const index of present) {
      if (index.name && index.name !== "_id_" && !declared.has(index.name)) {
        await collection.dropIndex(index.name);
      }
    }

    for (const entry of entries) {
      await collection.createIndex(entry.key, {
        name: entry.name,
        ...entry.options,
      });
    }
  }
}
