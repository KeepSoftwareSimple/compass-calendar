import { faker } from "@faker-js/faker";
import {
  type ConnectionId,
  type PrincipalId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { setupSyncStorage } from "@sync/__tests__/helpers/storage";
import { requeueFailedJobs } from "@sync/domain/failed-job-requeue.service";
import { type JobEnqueue } from "@sync/storage/contracts/job.contracts";
import { JobRepository } from "@sync/storage/repositories/job.repository";
import { SyncResourceRepository } from "@sync/storage/repositories/sync-resource.repository";

const objectId = () => faker.database.mongodbObjectId();
const NOW = new Date("2026-07-20T12:00:00.000Z");
const now = () => NOW;
// Jobs last due before this instant have cooled down enough to requeue.
const cooldownBefore = new Date("2026-07-20T11:30:00.000Z");

describe("requeueFailedJobs", () => {
  const storage = setupSyncStorage(import.meta.url);
  let jobs: JobRepository;
  let resources: SyncResourceRepository;

  beforeEach(() => {
    jobs = new JobRepository(storage.db());
    resources = new SyncResourceRepository(storage.db());
  });

  const deps = () => ({ jobs, resources });

  // Enqueue, claim, and fail a job so a test starts directly from
  // state:"failed" without driving a real worker's retry ladder.
  const seedFailed = async (
    overrides: Partial<JobEnqueue> = {},
  ): Promise<{
    id: string;
    tenantId: string;
    principalId: string;
    connectionId: string;
  }> => {
    const tenantId = objectId() as TenantId;
    const principalId = objectId() as PrincipalId;
    const connectionId = objectId() as ConnectionId;
    const job = await jobs.enqueue({
      tenantId: tenantId,
      principalId: principalId,
      connectionId: connectionId,
      resourceId: null,
      commandId: null,
      kind: "incrementalPull",
      priority: 0,
      runAfter: new Date("2026-07-20T10:00:00.000Z"),
      coalescingKey: `pull:${objectId()}`,
      ...overrides,
    } as JobEnqueue);
    const claimed = await jobs.claimDueJob("worker", NOW, 60_000);
    await jobs.fail(claimed!._id, "worker");
    return {
      id: job._id,
      tenantId: String(job.tenantId),
      principalId: String(job.principalId),
      connectionId: String(job.connectionId),
    };
  };

  const burnRequeueBudget = async (id: string, maxRequeues: number) => {
    for (let cycle = 0; cycle < maxRequeues; cycle += 1) {
      await jobs.requeue(id as never, new Date("2026-07-20T10:00:00.000Z"));
      const reclaimed = await jobs.claimDueJob(
        "worker",
        new Date("2026-07-20T10:00:00.000Z"),
        60_000,
      );
      await jobs.fail(reclaimed!._id, "worker");
    }
  };

  it("requeues a cooled-down failed job with a fresh attempt budget", async () => {
    const { id } = await seedFailed({
      runAfter: new Date("2026-07-20T10:00:00.000Z"),
    });

    const result = await requeueFailedJobs(deps(), cooldownBefore, now, 3);

    expect(result).toEqual({
      requeued: 1,
      exhausted: 0,
      exhaustedJobs: [],
      clearedDurable: 0,
      clearedJobs: [],
    });
    const raw = await storage
      .db()
      .collection("jobs")
      .findOne({ _id: id as never });
    expect(raw?.["state"]).toBe("pending");
    expect(raw?.["runAfter"]).toEqual(NOW);
    expect(raw?.["requeuedCount"]).toBe(1);
  });

  it("leaves a job that has not cooled down yet failed", async () => {
    await seedFailed({ runAfter: new Date("2026-07-20T11:45:00.000Z") });

    const result = await requeueFailedJobs(deps(), cooldownBefore, now, 3);

    expect(result).toEqual({
      requeued: 0,
      exhausted: 0,
      exhaustedJobs: [],
      clearedDurable: 0,
      clearedJobs: [],
    });
  });

  it("stops requeuing once a job hits the cap and reports it as exhausted", async () => {
    const { id } = await seedFailed({
      runAfter: new Date("2026-07-20T10:00:00.000Z"),
    });
    await burnRequeueBudget(id, 2);

    const result = await requeueFailedJobs(deps(), cooldownBefore, now, 2);

    expect(result.requeued).toBe(0);
    expect(result.exhausted).toBe(1);
    expect(result.clearedDurable).toBe(0);
    expect(result.exhaustedJobs).toEqual([
      expect.objectContaining({
        id,
        failureClass: "retryableTransient",
        requeuedCount: 2,
      }),
    ]);
  });

  it("clears an exhausted job when the connection already has a durable read failure", async () => {
    // Mirrors 2026-08-09 prod: calendarListSync exhausted while events on the
    // same connection already carried lastReadFailureAt from incrementalPull
    // drops for notACalendarUser.
    const { id, tenantId, principalId, connectionId } = await seedFailed({
      kind: "calendarListSync",
      coalescingKey: `calendarListSync:${objectId()}`,
      runAfter: new Date("2026-07-20T10:00:00.000Z"),
    });
    await burnRequeueBudget(id, 2);
    const events = await resources.ensure({
      tenantId: tenantId as never,
      principalId: principalId as never,
      connectionId: connectionId as never,
      resourceKind: "events",
      calendarId: objectId() as never,
    });
    await resources.markReadFailure(
      tenantId as never,
      principalId as never,
      events._id,
      NOW,
      "The user must be signed up for Google Calendar. (HTTP 403, reason notACalendarUser)",
    );

    const result = await requeueFailedJobs(deps(), cooldownBefore, now, 2);

    expect(result).toEqual({
      requeued: 0,
      exhausted: 0,
      exhaustedJobs: [],
      clearedDurable: 1,
      clearedJobs: [expect.objectContaining({ id, connectionId })],
    });
    expect(
      await storage
        .db()
        .collection("jobs")
        .findOne({ _id: id as never }),
    ).toBeNull();
  });

  it("does not clear an exhausted job without a durable read-failure marker", async () => {
    const { id, tenantId, principalId, connectionId } = await seedFailed({
      runAfter: new Date("2026-07-20T10:00:00.000Z"),
    });
    await burnRequeueBudget(id, 2);
    // Resource exists but has never been stamped with a durable refusal —
    // operator attention is still warranted.
    await resources.ensure({
      tenantId: tenantId as never,
      principalId: principalId as never,
      connectionId: connectionId as never,
      resourceKind: "calendarList",
      calendarId: null,
    });

    const result = await requeueFailedJobs(deps(), cooldownBefore, now, 2);

    expect(result.clearedDurable).toBe(0);
    expect(result.exhausted).toBe(1);
    expect(
      await storage
        .db()
        .collection("jobs")
        .findOne({ _id: id as never }),
    ).toMatchObject({ state: "failed" });
  });

  it("does nothing when there are no failed jobs", async () => {
    expect(await requeueFailedJobs(deps(), cooldownBefore, now, 3)).toEqual({
      requeued: 0,
      exhausted: 0,
      exhaustedJobs: [],
      clearedDurable: 0,
      clearedJobs: [],
    });
  });

  it("requeues a job written before requeuedCount existed", async () => {
    // Mongo's {$lt: n} does not match a missing field, so the self-heal sweep
    // could not see the very jobs most likely to be wedged: the ones old
    // enough to predate its own bookkeeping field. Three such jobs sat failed
    // in prod while this sweep reported nothing to do (2026-07-31).
    const { id } = await seedFailed({
      runAfter: new Date("2026-07-20T10:00:00.000Z"),
    });
    await storage
      .db()
      .collection("jobs")
      .updateOne({ _id: id as never }, { $unset: { requeuedCount: "" } });

    const result = await requeueFailedJobs(deps(), cooldownBefore, now, 3);

    expect(result.requeued).toBe(1);
    expect(result.exhausted).toBe(0);
    const raw = await storage
      .db()
      .collection("jobs")
      .findOne({ _id: id as never });
    expect(raw?.["state"]).toBe("pending");
    // Absence counted as zero, so the requeue is its first, not its last.
    expect(raw?.["requeuedCount"]).toBe(1);
  });
});
