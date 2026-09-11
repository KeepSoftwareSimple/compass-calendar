import { faker } from "@faker-js/faker";
import { seedOauthCredential } from "@sync/__tests__/helpers/credential-encryption";
import { stringIdFilter } from "@sync/__tests__/helpers/mongo-id";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { enqueueForResources } from "@sync/domain/resource-sweep-enqueue";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import { resourceJob } from "@sync/storage/contracts/job.contracts";
import { type SyncResourceRecord } from "@sync/storage/contracts/sync-resource.contracts";
import { CredentialRepository } from "@sync/storage/repositories/credential.repository";
import { JobRepository } from "@sync/storage/repositories/job.repository";
import { SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";

const objectId = () => faker.database.mongodbObjectId();
const now = () => new Date("2026-07-10T00:00:00.000Z");
// Resources not synced since this instant are stale.
const staleBefore = new Date("2026-07-09T00:00:00.000Z");

// app.ts's reconcile sweep: enqueueForResources bound to listStaleEvents /
// "incrementalPull", the same shape it's called with there.
const reconcileStaleCalendars = (
  deps: {
    resources: SyncResourceRepository;
    jobs: JobRepository;
    onEnqueueError?: (error: unknown, resourceId: string) => void;
  },
  before: Date,
  nowFn: () => Date,
  limit?: number,
) =>
  enqueueForResources(
    deps,
    (b, l) => deps.resources.listStaleEvents(b, l),
    (r, n) => resourceJob(r, "incrementalPull", n()),
    before,
    nowFn,
    limit,
  );

describe("reconcile sweep (enqueueForResources + listStaleEvents)", () => {
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

  // Ensure an events resource and set its last success to `lastSuccessAt`
  // (omit for a never-synced resource). Each gets a distinct calendar so the
  // unique (connection, kind, calendar) identity never collides. The sweep
  // only selects resources whose connection can still authenticate, so a
  // credential is stored by default; pass withCredential: false to simulate a
  // dead/disconnected connection.
  const seedResource = async (
    lastSuccessAt: Date | null,
    options: { withCredential?: boolean } = {},
  ): Promise<SyncResourceRecord> => {
    const tenantId = objectId() as SyncResourceRecord["tenantId"];
    const principalId = objectId() as SyncResourceRecord["principalId"];
    const connectionId = objectId() as SyncResourceRecord["connectionId"];
    const resource = await resources.ensure({
      tenantId,
      principalId,
      connectionId,
      resourceKind: "events",
      calendarId: objectId() as SyncResourceRecord["calendarId"],
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
        "cursor",
        lastSuccessAt,
      );
    }
    return resource;
  };

  const jobByKey = (coalescingKey: string) =>
    storage.db().collection(SYNC_COLLECTIONS.jobs).findOne({ coalescingKey });

  const jobCount = () =>
    storage.db().collection(SYNC_COLLECTIONS.jobs).countDocuments({});

  it("enqueues an incremental pull for a stale resource", async () => {
    const stale = await seedResource(new Date("2026-07-01T00:00:00.000Z"));

    const enqueued = await reconcileStaleCalendars(deps(), staleBefore, now);

    expect(enqueued).toBe(1);
    const job = await jobByKey(`incrementalPull:${stale._id}`);
    expect(job?.["kind"]).toBe("incrementalPull");
    expect(job?.["resourceId"]).toBe(stale._id);
    expect(job?.["tenantId"]).toBe(stale.tenantId);
  });

  it("skips a resource synced more recently than the threshold", async () => {
    await seedResource(new Date("2026-07-09T12:00:00.000Z")); // after staleBefore

    const enqueued = await reconcileStaleCalendars(deps(), staleBefore, now);

    expect(enqueued).toBe(0);
    expect(await jobCount()).toBe(0);
  });

  it("enqueues a pull for a never-synced resource (bootstrap)", async () => {
    const fresh = await seedResource(null);

    const enqueued = await reconcileStaleCalendars(deps(), staleBefore, now);

    expect(enqueued).toBe(1);
    expect(await jobByKey(`incrementalPull:${fresh._id}`)).not.toBeNull();
  });

  it("coalesces repeated sweeps into one job per resource", async () => {
    const stale = await seedResource(new Date("2026-07-01T00:00:00.000Z"));

    await reconcileStaleCalendars(deps(), staleBefore, now);
    await reconcileStaleCalendars(deps(), staleBefore, now);

    expect(
      await storage
        .db()
        .collection(SYNC_COLLECTIONS.jobs)
        .countDocuments({ coalescingKey: `incrementalPull:${stale._id}` }),
    ).toBe(1);
  });

  it("bounds the sweep and takes the oldest first", async () => {
    await seedResource(new Date("2026-07-05T00:00:00.000Z"));
    await seedResource(new Date("2026-07-02T00:00:00.000Z")); // oldest
    await seedResource(new Date("2026-07-06T00:00:00.000Z"));

    const enqueued = await reconcileStaleCalendars(deps(), staleBefore, now, 1);

    expect(enqueued).toBe(1);
    // The single job is for the oldest (2026-07-02) resource.
    const jobs2 = await storage
      .db()
      .collection(SYNC_COLLECTIONS.jobs)
      .find({})
      .toArray();
    expect(jobs2).toHaveLength(1);
    const resourceId = jobs2[0]?.["resourceId"] as string;
    const resource = await storage
      .db()
      .collection(SYNC_COLLECTIONS.syncResources)
      .findOne(stringIdFilter(resourceId));
    expect(resource?.["lastSuccessAt"]).toEqual(
      new Date("2026-07-02T00:00:00.000Z"),
    );
  });

  it("rotates an attempted-but-never-successful resource behind never-attempted ones", async () => {
    // The 2026-07-29 regression: ~100 resources whose pulls always die early
    // (dead credential) have lastSuccessAt null forever. Sorted by success
    // they monopolize the head of every bounded sweep batch and starve the
    // healthy stale resources behind them. Sorting by ATTEMPT rotates them:
    // once tried, they go to the back until everything else has had a turn.
    const doomed = await seedResource(null); // never succeeds
    const healthy = await seedResource(new Date("2026-07-05T00:00:00.000Z"));
    await resources.markAttempt(
      doomed.tenantId,
      doomed.principalId,
      doomed._id,
      new Date("2026-07-29T16:00:00.000Z"),
    );

    const enqueued = await reconcileStaleCalendars(deps(), staleBefore, now, 1);

    expect(enqueued).toBe(1);
    // The single slot goes to the never-attempted resource, even though the
    // doomed one is "more stale" by success time (null).
    expect(await jobByKey(`incrementalPull:${healthy._id}`)).not.toBeNull();
    expect(await jobByKey(`incrementalPull:${doomed._id}`)).toBeNull();
  });

  it("excludes a resource whose connection has no stored credential, however stale", async () => {
    // The rotation fix above only helps AFTER a first attempt: it does nothing
    // for the population still tied at lastAttemptAt: null, where dead-
    // credential resources and genuinely healthy never-attempted ones sit
    // side by side. Mongo's tie-break there is not random — in prod it
    // reproducibly favored the dead-credential cohort (2026-07-29: a clean
    // post-rotation-fix sweep batch still selected 100 resources with only 1
    // holding a credential). The sweep must exclude credential-less
    // connections outright; they resume via reconnect, not reconcile.
    const deadCredential = await seedResource(null, { withCredential: false });
    const healthy = await seedResource(new Date("2026-07-05T00:00:00.000Z"));

    const enqueued = await reconcileStaleCalendars(deps(), staleBefore, now, 1);

    expect(enqueued).toBe(1);
    expect(await jobByKey(`incrementalPull:${healthy._id}`)).not.toBeNull();
    expect(await jobByKey(`incrementalPull:${deadCredential._id}`)).toBeNull();
  });

  it("skips a resource whose existing job cannot be read and sweeps the rest", async () => {
    // 2026-07-31: three job docs written before `requeuedCount` existed made
    // enqueue's coalescing read throw, and the sweep's loop had no per-item
    // guard — so one unreadable doc abandoned the whole batch on every cycle
    // and froze calendar sync fleet-wide for 23h. The finders sort
    // deterministically, so the poisoned resource re-won the front of the
    // ordering every time; nothing behind it ever ran again.
    const poisoned = await seedResource(new Date("2026-07-01T00:00:00.000Z"));
    const healthy = await seedResource(new Date("2026-07-02T00:00:00.000Z"));
    // A job doc that cannot be parsed back out (kind is not a JobKind), sitting
    // on the coalescing key the sweep is about to reuse.
    await storage
      .db()
      .collection(SYNC_COLLECTIONS.jobs)
      .insertOne({
        _id: objectId(),
        coalescingKey: `incrementalPull:${poisoned._id}`,
        kind: "notAJobKind",
      } as never);
    const failures: string[] = [];

    const enqueued = await reconcileStaleCalendars(
      { resources, jobs, onEnqueueError: (_e, id) => failures.push(id) },
      staleBefore,
      now,
    );

    // The healthy resource behind the poisoned one still got its pull, and the
    // count reflects what was actually enqueued rather than what was found.
    expect(enqueued).toBe(1);
    expect(await jobByKey(`incrementalPull:${healthy._id}`)).not.toBeNull();
    expect(failures).toEqual([poisoned._id]);
  });

  it("enqueues onto a job written before requeuedCount existed", async () => {
    // The specific doc shape that caused the freeze: valid work, just older
    // than the field. It must read back as zero requeues, not as an error.
    const stale = await seedResource(new Date("2026-07-01T00:00:00.000Z"));
    await reconcileStaleCalendars(deps(), staleBefore, now);
    await storage
      .db()
      .collection(SYNC_COLLECTIONS.jobs)
      .updateOne(
        { coalescingKey: `incrementalPull:${stale._id}` },
        { $unset: { requeuedCount: "" } },
      );

    const enqueued = await reconcileStaleCalendars(deps(), staleBefore, now);

    expect(enqueued).toBe(1);
  });
});
