import { faker } from "@faker-js/faker";
import { seedOauthCredential } from "@sync/__tests__/helpers/credential-encryption";
import { mongoObjectId } from "@sync/__tests__/helpers/mongo-id";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { rediscoverStaleCalendarLists } from "@sync/domain/calendar-list-rediscovery.service";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import { type SyncResourceRecord } from "@sync/storage/contracts/sync-resource.contracts";
import { CredentialRepository } from "@sync/storage/repositories/credential.repository";
import { JobRepository } from "@sync/storage/repositories/job.repository";
import { SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";

const objectId = () => faker.database.mongodbObjectId();
const now = () => new Date("2026-08-07T00:00:00.000Z");
// calendarList resources not fully re-listed since this instant are stale.
const staleBefore = new Date("2026-08-06T00:00:00.000Z");

describe("calendar-list rediscovery sweep (rediscoverStaleCalendarLists)", () => {
  const storage = setupSyncStorage(import.meta.url);
  let resources: SyncResourceRepository;
  let jobs: JobRepository;
  let credentials: CredentialRepository;

  beforeEach(() => {
    resources = new SyncResourceRepository(storage.db());
    jobs = new JobRepository(storage.db());
    credentials = new CredentialRepository(storage.db());
  });

  const deps = () => ({ resources, jobs });

  // A connection's calendarList resource, holding a cursor (as a live
  // connection's does after its initial connect).
  //
  // `fullListedAt` is the clock this sweep selects on; `lastSuccessAt` defaults
  // to match it, because a real full pass stamps both. Pass them SEPARATELY to
  // model the bug this sweep exists to survive: an active user's incremental
  // passes keep lastSuccessAt fresh while lastFullListAt stays old.
  // Pass withCredential: false to simulate a dead/disconnected connection.
  const seedCalendarListResource = async (
    options: {
      fullListedAt?: Date | null;
      lastSuccessAt?: Date | null;
      withCredential?: boolean;
    } = {},
  ): Promise<SyncResourceRecord> => {
    const fullListedAt = options.fullListedAt ?? null;
    const lastSuccessAt =
      options.lastSuccessAt === undefined
        ? fullListedAt
        : options.lastSuccessAt;
    const tenantId = objectId() as SyncResourceRecord["tenantId"];
    const principalId = objectId() as SyncResourceRecord["principalId"];
    const connectionId = objectId() as SyncResourceRecord["connectionId"];
    const resource = await resources.ensure({
      tenantId,
      principalId,
      connectionId,
      resourceKind: "calendarList",
      calendarId: null,
    });
    if (options.withCredential ?? true) {
      await seedOauthCredential(credentials, {
        connectionId,
        provider: "google",
        refreshToken: "refresh-token",
        scopes: [],
      });
    }
    if (lastSuccessAt) {
      await resources.advanceCursor(
        tenantId,
        principalId,
        resource._id,
        "cursor-token",
        lastSuccessAt,
      );
    }
    if (fullListedAt) {
      await resources.markFullListCompleted(
        tenantId,
        principalId,
        resource._id,
        fullListedAt,
      );
    }
    return resource;
  };

  const jobByKey = (coalescingKey: string) =>
    storage.db().collection(SYNC_COLLECTIONS.jobs).findOne({ coalescingKey });

  const jobCount = () =>
    storage.db().collection(SYNC_COLLECTIONS.jobs).countDocuments({});

  const resourceById = (id: string) =>
    storage.db().collection(SYNC_COLLECTIONS.syncResources).findOne({
      _id: id,
    });

  it("clears the cursor and enqueues a connection-scoped calendarListSync for a stale resource", async () => {
    const stale = await seedCalendarListResource({
      fullListedAt: new Date("2026-08-01T00:00:00.000Z"),
    });

    const enqueued = await rediscoverStaleCalendarLists(
      deps(),
      staleBefore,
      now,
    );

    expect(enqueued).toBe(1);
    const record = await resourceById(stale._id);
    expect(record?.syncCursor).toBeNull();
    // lastFullListAt is the staleness key the sweep selects on; clearing the
    // cursor must not also stamp it, or the resource would look satisfied for a
    // day on the strength of a pass that has not run yet.
    expect(record?.lastFullListAt).toEqual(
      new Date("2026-08-01T00:00:00.000Z"),
    );
    expect(record?.lastSuccessAt).toEqual(new Date("2026-08-01T00:00:00.000Z"));

    const job = await jobByKey(`calendarListSync:${stale.connectionId}`);
    expect(job?.kind).toBe("calendarListSync");
    // Connection-scoped, not resource-scoped: matches registerConnection's
    // own enqueue shape so the two never race on different coalescing keys.
    expect(job?.resourceId).toBeNull();
    expect(job?.tenantId).toBe(stale.tenantId);
  });

  it("skips a resource fully re-listed more recently than the threshold", async () => {
    await seedCalendarListResource({
      fullListedAt: new Date("2026-08-06T12:00:00.000Z"), // after staleBefore
    });

    const enqueued = await rediscoverStaleCalendarLists(
      deps(),
      staleBefore,
      now,
    );

    expect(enqueued).toBe(0);
    expect(await jobCount()).toBe(0);
  });

  it("re-discovers an active user whose incremental passes keep lastSuccessAt fresh", async () => {
    // THE BUG (2026-08-27). The web client refreshes on every page load and
    // every alt-tab-back after 30s, and each one runs an incremental
    // calendarList pass that stamps lastSuccessAt. While the sweep selected on
    // that field, a daily user could never age into it, so the full pass that
    // retires hidden/removed calendars never ran for them — the connections
    // that self-healed after #2876 were the IDLE ones. Selecting on
    // lastFullListAt is what makes usage stop suppressing the repair.
    const active = await seedCalendarListResource({
      fullListedAt: new Date("2026-08-04T00:00:00.000Z"),
      lastSuccessAt: new Date("2026-08-06T23:00:00.000Z"),
    });

    const enqueued = await rediscoverStaleCalendarLists(
      deps(),
      staleBefore,
      now,
    );

    expect(enqueued).toBe(1);
    expect(
      await jobByKey(`calendarListSync:${active.connectionId}`),
    ).not.toBeNull();
  });

  it("skips a resource whose full list is fresh even when lastSuccessAt is stale", async () => {
    // The inverse of the case above: pins that we SWAPPED the selection key
    // rather than adding a second one that ORs the old behavior back in.
    await seedCalendarListResource({
      fullListedAt: new Date("2026-08-06T12:00:00.000Z"),
      lastSuccessAt: new Date("2026-08-01T00:00:00.000Z"),
    });

    const enqueued = await rediscoverStaleCalendarLists(
      deps(),
      staleBefore,
      now,
    );

    expect(enqueued).toBe(0);
    expect(await jobCount()).toBe(0);
  });

  it("re-discovers a resource that has never been fully listed", async () => {
    const fresh = await seedCalendarListResource();

    const enqueued = await rediscoverStaleCalendarLists(
      deps(),
      staleBefore,
      now,
    );

    expect(enqueued).toBe(1);
    expect(
      await jobByKey(`calendarListSync:${fresh.connectionId}`),
    ).not.toBeNull();
  });

  it("re-discovers a row written before lastFullListAt existed", async () => {
    // The self-backfill, and the reason no migration script ships with this
    // field: every row predating it has the key ABSENT, not null. Inserted raw
    // rather than through ensure() so the schema default cannot write a null
    // and make this pass for the wrong reason — Mongo's null predicate has to
    // match the missing key on its own.
    const tenantId = objectId() as SyncResourceRecord["tenantId"];
    const principalId = objectId() as SyncResourceRecord["principalId"];
    const connectionId = objectId() as SyncResourceRecord["connectionId"];
    const legacy = await resources.ensure({
      tenantId,
      principalId,
      connectionId,
      resourceKind: "calendarList",
      calendarId: null,
    });
    await seedOauthCredential(credentials, {
      connectionId,
      provider: "google",
      refreshToken: "refresh-token",
      scopes: [],
    });
    await storage
      .db()
      .collection(SYNC_COLLECTIONS.syncResources)
      .updateOne(
        { _id: mongoObjectId(legacy._id) },
        { $unset: { lastFullListAt: "" } },
      );

    const enqueued = await rediscoverStaleCalendarLists(
      deps(),
      staleBefore,
      now,
    );

    expect(enqueued).toBe(1);
    expect(
      await jobByKey(`calendarListSync:${legacy.connectionId}`),
    ).not.toBeNull();
  });

  it("coalesces onto an already-pending calendarListSync job while still clearing the cursor", async () => {
    // registerConnection may have already enqueued calendarListSync (e.g. a
    // reconnect raced the sweep). The sweep's enqueue must collapse onto that
    // job rather than mint a second one, since JobRepository.enqueue only
    // $setOnInsert's — but the cursor clear still has to land, because
    // whichever job runs reads the cursor fresh at execution time.
    const stale = await seedCalendarListResource({
      fullListedAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    await jobs.enqueue({
      tenantId: stale.tenantId,
      principalId: stale.principalId,
      connectionId: stale.connectionId,
      resourceId: null,
      commandId: null,
      kind: "calendarListSync",
      priority: 0,
      runAfter: now(),
      coalescingKey: `calendarListSync:${stale.connectionId}`,
    });

    const enqueued = await rediscoverStaleCalendarLists(
      deps(),
      staleBefore,
      now,
    );

    expect(enqueued).toBe(1);
    expect(
      await storage
        .db()
        .collection(SYNC_COLLECTIONS.jobs)
        .countDocuments({
          coalescingKey: `calendarListSync:${stale.connectionId}`,
        }),
    ).toBe(1);
    const record = await resourceById(stale._id);
    expect(record?.syncCursor).toBeNull();
  });

  it("excludes a resource whose connection has no stored credential, however stale", async () => {
    const deadCredential = await seedCalendarListResource({
      withCredential: false,
    });
    const healthy = await seedCalendarListResource({
      fullListedAt: new Date("2026-08-01T00:00:00.000Z"),
    });

    const enqueued = await rediscoverStaleCalendarLists(
      deps(),
      staleBefore,
      now,
    );

    expect(enqueued).toBe(1);
    expect(
      await jobByKey(`calendarListSync:${healthy.connectionId}`),
    ).not.toBeNull();
    expect(
      await jobByKey(`calendarListSync:${deadCredential.connectionId}`),
    ).toBeNull();
  });

  it("rotates a permanently-failing connection behind others via lastAttemptAt", async () => {
    // Why lastAttemptAt stays the PRIMARY sort key even though the filter moved
    // to lastFullListAt: a connection whose full pass always throws never
    // stamps lastFullListAt, so sorting on that field first would leave it at
    // null, re-winning the front of every sweep and starving everyone behind it
    // — the dead-credential-cohort pathology reconcile hit on 2026-07-29.
    // syncCalendarList stamps lastAttemptAt before the token fetch can fail, so
    // the doomed connection rotates to the back after a single attempt.
    const doomed = await seedCalendarListResource();
    const healthy = await seedCalendarListResource({
      fullListedAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    await resources.markAttempt(
      doomed.tenantId,
      doomed.principalId,
      doomed._id,
      new Date("2026-08-06T16:00:00.000Z"),
    );

    const enqueued = await rediscoverStaleCalendarLists(
      deps(),
      staleBefore,
      now,
      1,
    );

    expect(enqueued).toBe(1);
    expect(
      await jobByKey(`calendarListSync:${healthy.connectionId}`),
    ).not.toBeNull();
    expect(
      await jobByKey(`calendarListSync:${doomed.connectionId}`),
    ).toBeNull();
  });

  it("skips a connection whose cursor clear or enqueue fails and sweeps the rest", async () => {
    const poisoned = await seedCalendarListResource({
      fullListedAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    const healthy = await seedCalendarListResource({
      fullListedAt: new Date("2026-08-02T00:00:00.000Z"),
    });
    // A job doc that cannot be parsed back out, sitting on the coalescing key
    // the sweep is about to reuse — mirrors the 2026-07-31 fleet-freeze shape
    // (resource-sweep-enqueue.reconcile.db.test.ts) for this sweep's own key.
    await storage
      .db()
      .collection(SYNC_COLLECTIONS.jobs)
      .insertOne({
        _id: objectId(),
        coalescingKey: `calendarListSync:${poisoned.connectionId}`,
        kind: "notAJobKind",
      } as never);
    const failures: string[] = [];

    const enqueued = await rediscoverStaleCalendarLists(
      {
        resources,
        jobs,
        onError: (_e, resourceId) => failures.push(resourceId),
      },
      staleBefore,
      now,
    );

    expect(enqueued).toBe(1);
    expect(
      await jobByKey(`calendarListSync:${healthy.connectionId}`),
    ).not.toBeNull();
    // enqueueForResources reports the resourceId it failed on (the shared
    // helper's contract), not the connectionId — poisoned's own resource id.
    expect(failures).toEqual([poisoned._id]);
  });
});
