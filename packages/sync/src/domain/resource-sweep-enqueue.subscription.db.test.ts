import { faker } from "@faker-js/faker";
import { stringIdFilter } from "@sync/__tests__/helpers/mongo-id";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { enqueueForResources } from "@sync/domain/resource-sweep-enqueue";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import { resourceJob } from "@sync/storage/contracts/job.contracts";
import { type SyncResourceRecord } from "@sync/storage/contracts/sync-resource.contracts";
import { JobRepository } from "@sync/storage/repositories/job.repository";
import { SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";

const objectId = () => faker.database.mongodbObjectId();
const now = () => new Date("2026-07-10T00:00:00.000Z");
// Subscriptions expiring before this instant are due for renewal.
const renewBefore = new Date("2026-07-10T12:00:00.000Z");

// app.ts's subscription sweep: enqueueForResources bound to
// listExpiringSubscriptions / "subscriptionMaintain", the same shape it's
// called with there.
const maintainExpiringSubscriptions = (
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
    (b, l) => deps.resources.listExpiringSubscriptions(b, l),
    (r, n) => resourceJob(r, "subscriptionMaintain", n()),
    before,
    nowFn,
    limit,
  );

describe("subscription-maintenance sweep (enqueueForResources + listExpiringSubscriptions)", () => {
  const storage = setupSyncStorage(import.meta.url);
  let resources: SyncResourceRepository;
  let jobs: JobRepository;

  beforeEach(() => {
    resources = new SyncResourceRepository(storage.db());
    jobs = new JobRepository(storage.db());
  });

  const deps = () => ({ resources, jobs });

  // Ensure an events resource, optionally holding a subscription that expires at
  // `expiresAt`. Each gets a distinct calendar so the unique (connection, kind,
  // calendar) identity never collides.
  const seedResource = async (
    expiresAt: Date | null,
  ): Promise<SyncResourceRecord> => {
    const tenantId = objectId() as SyncResourceRecord["tenantId"];
    const principalId = objectId() as SyncResourceRecord["principalId"];
    const resource = await resources.ensure({
      tenantId,
      principalId,
      connectionId: objectId() as SyncResourceRecord["connectionId"],
      resourceKind: "events",
      calendarId: objectId() as SyncResourceRecord["calendarId"],
    });
    if (expiresAt) {
      await resources.updateSubscription(tenantId, principalId, resource._id, {
        subscriptionId: `channel-${resource._id}`,
        subscriptionResourceId: `res-${resource._id}`,
        subscriptionToken: "token",
        subscriptionExpiresAt: expiresAt,
      });
    }
    return resource;
  };

  const jobByKey = (coalescingKey: string) =>
    storage.db().collection(SYNC_COLLECTIONS.jobs).findOne({ coalescingKey });

  const jobCount = () =>
    storage.db().collection(SYNC_COLLECTIONS.jobs).countDocuments({});

  it("enqueues a maintain job for a subscription expiring before the threshold", async () => {
    const expiring = await seedResource(new Date("2026-07-10T01:00:00.000Z"));

    const enqueued = await maintainExpiringSubscriptions(
      deps(),
      renewBefore,
      now,
    );

    expect(enqueued).toBe(1);
    const job = await jobByKey(`subscriptionMaintain:${expiring._id}`);
    expect(job?.["kind"]).toBe("subscriptionMaintain");
    expect(job?.["resourceId"]).toBe(expiring._id);
    expect(job?.["tenantId"]).toBe(expiring.tenantId);
  });

  it("skips a subscription that expires after the threshold", async () => {
    await seedResource(new Date("2026-07-11T00:00:00.000Z")); // after renewBefore

    const enqueued = await maintainExpiringSubscriptions(
      deps(),
      renewBefore,
      now,
    );

    expect(enqueued).toBe(0);
    expect(await jobCount()).toBe(0);
  });

  it("skips a resource with no subscription (bootstrap is the import followup's job)", async () => {
    await seedResource(null);

    const enqueued = await maintainExpiringSubscriptions(
      deps(),
      renewBefore,
      now,
    );

    expect(enqueued).toBe(0);
    expect(await jobCount()).toBe(0);
  });

  it("enqueues a maintain job for an expiring calendar-list channel", async () => {
    const tenantId = objectId() as SyncResourceRecord["tenantId"];
    const principalId = objectId() as SyncResourceRecord["principalId"];
    const resource = await resources.ensure({
      tenantId,
      principalId,
      connectionId: objectId() as SyncResourceRecord["connectionId"],
      resourceKind: "calendarList",
      calendarId: null,
    });
    await resources.updateSubscription(tenantId, principalId, resource._id, {
      subscriptionId: `channel-${resource._id}`,
      subscriptionResourceId: `res-${resource._id}`,
      subscriptionToken: "token",
      subscriptionExpiresAt: new Date("2026-07-10T01:00:00.000Z"),
    });

    const enqueued = await maintainExpiringSubscriptions(
      deps(),
      renewBefore,
      now,
    );

    expect(enqueued).toBe(1);
    const job = await jobByKey(`subscriptionMaintain:${resource._id}`);
    expect(job?.["kind"]).toBe("subscriptionMaintain");
    expect(job?.["resourceId"]).toBe(resource._id);
  });

  it("coalesces repeated sweeps into one job per resource", async () => {
    const expiring = await seedResource(new Date("2026-07-10T01:00:00.000Z"));

    await maintainExpiringSubscriptions(deps(), renewBefore, now);
    await maintainExpiringSubscriptions(deps(), renewBefore, now);

    expect(
      await storage
        .db()
        .collection(SYNC_COLLECTIONS.jobs)
        .countDocuments({
          coalescingKey: `subscriptionMaintain:${expiring._id}`,
        }),
    ).toBe(1);
  });

  it("bounds the sweep and takes the soonest-expiring first", async () => {
    await seedResource(new Date("2026-07-10T05:00:00.000Z"));
    await seedResource(new Date("2026-07-10T02:00:00.000Z")); // soonest
    await seedResource(new Date("2026-07-10T08:00:00.000Z"));

    const enqueued = await maintainExpiringSubscriptions(
      deps(),
      renewBefore,
      now,
      1,
    );

    expect(enqueued).toBe(1);
    const enqueuedJobs = await storage
      .db()
      .collection(SYNC_COLLECTIONS.jobs)
      .find({})
      .toArray();
    expect(enqueuedJobs).toHaveLength(1);
    const resourceId = enqueuedJobs[0]?.["resourceId"] as string;
    const resource = await storage
      .db()
      .collection(SYNC_COLLECTIONS.syncResources)
      .findOne(stringIdFilter(resourceId));
    expect(resource?.["subscriptionExpiresAt"]).toEqual(
      new Date("2026-07-10T02:00:00.000Z"),
    );
  });
});
