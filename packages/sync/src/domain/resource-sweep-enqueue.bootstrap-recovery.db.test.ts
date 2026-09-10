import { faker } from "@faker-js/faker";
import { seedOauthCredential } from "@sync/__tests__/helpers/credential-encryption";
import { stringIdFilter } from "@sync/__tests__/helpers/mongo-id";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { enqueueForResources } from "@sync/domain/resource-sweep-enqueue";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import { resourceJob } from "@sync/storage/contracts/job.contracts";
import {
  type ResourceBootstrapState,
  type SyncResourceRecord,
} from "@sync/storage/contracts/sync-resource.contracts";
import { CredentialRepository } from "@sync/storage/repositories/credential.repository";
import { JobRepository } from "@sync/storage/repositories/job.repository";
import { SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";

const objectId = () => faker.database.mongodbObjectId();
const now = () => new Date("2026-08-04T21:00:00.000Z");
// Resources untouched since this instant are stalled.
const stalledBefore = new Date("2026-08-04T20:45:00.000Z");

// app.ts's bootstrap-recovery sweep: enqueueForResources bound to
// listStalledBootstraps / "bootstrapCatchup", the same shape it's called
// with there.
const recoverStalledBootstraps = (
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
    (b, l) => deps.resources.listStalledBootstraps(b, l),
    (r, n) => resourceJob(r, "bootstrapCatchup", n()),
    before,
    nowFn,
    limit,
  );

describe("bootstrap-recovery sweep (enqueueForResources + listStalledBootstraps)", () => {
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

  // Seed an events resource in `bootstrapState`, backdated to `updatedAt` (a
  // fresh resource defaults to "now", too recent to be stalled - pass an
  // instant before stalledBefore to simulate one that has gone quiet). Each
  // gets its own calendar/connection so the unique identity never collides.
  const seedResource = async (
    bootstrapState: ResourceBootstrapState,
    updatedAt: Date,
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
    await storage
      .db()
      .collection(SYNC_COLLECTIONS.syncResources)
      .updateOne(
        stringIdFilter(resource._id),
        { $set: { bootstrapState, updatedAt } },
      );
    return { ...resource, bootstrapState, updatedAt };
  };

  const jobByKey = (coalescingKey: string) =>
    storage.db().collection(SYNC_COLLECTIONS.jobs).findOne({ coalescingKey });

  it("enqueues a bootstrapCatchup for a resource stalled mid-bootstrap", async () => {
    const stalled = await seedResource(
      "catchingUp",
      new Date("2026-08-04T20:00:00.000Z"),
    );

    const enqueued = await recoverStalledBootstraps(deps(), stalledBefore, now);

    expect(enqueued).toBe(1);
    const job = await jobByKey(`bootstrapCatchup:${stalled._id}`);
    expect(job?.kind).toBe("bootstrapCatchup");
    expect(job?.resourceId).toBe(stalled._id);
  });

  it("skips a resource whose bootstrap already reached ready", async () => {
    await seedResource("ready", new Date("2026-08-04T20:00:00.000Z"));

    const enqueued = await recoverStalledBootstraps(deps(), stalledBefore, now);

    expect(enqueued).toBe(0);
  });

  it("skips a resource still making progress within the window", async () => {
    // Touched after stalledBefore: its chain is alive and advancing on its
    // own, so re-entering it here would just duplicate the followup already
    // in flight.
    await seedResource("watching", new Date("2026-08-04T20:50:00.000Z"));

    const enqueued = await recoverStalledBootstraps(deps(), stalledBefore, now);

    expect(enqueued).toBe(0);
  });

  it("excludes a resource whose connection has no stored credential, however stalled", async () => {
    // Same #2455 lesson as reconcile's finder: a dead-credential resource
    // resumes on reconnect, not this sweep, and would otherwise tie-break to
    // the front of every bounded batch.
    const deadCredential = await seedResource(
      "catchingUp",
      new Date("2026-08-04T20:00:00.000Z"),
      { withCredential: false },
    );
    const healthy = await seedResource(
      "catchingUp",
      new Date("2026-08-04T20:01:00.000Z"),
    );

    const enqueued = await recoverStalledBootstraps(
      deps(),
      stalledBefore,
      now,
      1,
    );

    expect(enqueued).toBe(1);
    expect(await jobByKey(`bootstrapCatchup:${healthy._id}`)).not.toBeNull();
    expect(await jobByKey(`bootstrapCatchup:${deadCredential._id}`)).toBeNull();
  });

  it("coalesces repeated sweeps into one job per resource", async () => {
    const stalled = await seedResource(
      "catchingUp",
      new Date("2026-08-04T20:00:00.000Z"),
    );

    await recoverStalledBootstraps(deps(), stalledBefore, now);
    await recoverStalledBootstraps(deps(), stalledBefore, now);

    expect(
      await storage
        .db()
        .collection(SYNC_COLLECTIONS.jobs)
        .countDocuments({
          coalescingKey: `bootstrapCatchup:${stalled._id}`,
        }),
    ).toBe(1);
  });
});
