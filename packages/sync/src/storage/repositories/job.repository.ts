import { type Collection, type Db, ObjectId } from "mongodb";
import {
  type ConnectionId,
  type PrincipalId,
  type SyncJobId,
  type TenantId,
} from "@core/types/sync/identity.contracts";
import { SYNC_COLLECTIONS } from "@sync/storage/collections";
import {
  JOB_PRIORITY,
  type JobEnqueue,
  JobEnqueueSchema,
  type JobRecord,
  JobRecordSchema,
} from "@sync/storage/contracts/job.contracts";

export type ExhaustedFailedJob = {
  id: SyncJobId;
  coalescingKey: string;
  connectionId: ConnectionId;
  tenantId: TenantId;
  principalId: PrincipalId;
  failureClass: Exclude<JobRecord["failureClass"], null>;
  requeuedCount: number;
  updatedAt: Date;
};

export type EnqueueUrgentOutcome =
  | "created"
  | "boosted"
  | "requeuedFailed"
  | "inFlight";

type EnqueueForegroundOutcome = "created" | "boosted" | "inFlight" | "failed";

const jobQueueWakeListeners = new Set<() => void>();

// In-process wake for idle job drains. Enqueue (including webhook ingest)
// signals so a single Sync process claims new work immediately; extra
// replicas still fall back to the 5s poll.
export function subscribeJobQueueWake(listener: () => void): () => void {
  jobQueueWakeListeners.add(listener);
  return () => {
    jobQueueWakeListeners.delete(listener);
  };
}

function signalJobQueueWake(): void {
  for (const listener of jobQueueWakeListeners) listener();
}

// The exact complement of listFailedForRequeue's eligibility filter: {$gte}
// does not match a missing requeuedCount, so a legacy job counts as eligible
// there and never as exhausted here. Keep the two in step.
function exhaustedFailedFilter(maxRequeues: number) {
  return {
    state: "failed" as const,
    requeuedCount: { $gte: maxRequeues },
  };
}

// Repository for `jobs`. Enqueue coalesces on a unique key so repeated
// notifications for the same resource collapse into one pending job instead of
// an unbounded queue. Terminal jobs are removed so a later notification can
// re-enqueue the same coalescing key.
export class JobRepository {
  private readonly collection: Collection<JobRecord>;

  constructor(db: Db) {
    this.collection = db.collection<JobRecord>(SYNC_COLLECTIONS.jobs);
  }

  // Create the job if its coalescing key is new; otherwise return the existing
  // job unchanged. A burst of equivalent notifications therefore yields one
  // job, not many.
  async enqueue(input: JobEnqueue): Promise<JobRecord> {
    const fields = JobEnqueueSchema.parse(input);
    const now = new Date();

    const result = await this.collection.findOneAndUpdate(
      { coalescingKey: fields.coalescingKey },
      {
        $setOnInsert: {
          _id: new ObjectId().toHexString() as SyncJobId,
          tenantId: fields.tenantId,
          principalId: fields.principalId,
          connectionId: fields.connectionId,
          resourceId: fields.resourceId,
          commandId: fields.commandId,
          kind: fields.kind,
          priority: fields.priority,
          state: "pending",
          runAfter: fields.runAfter,
          attempt: 0,
          coalescingKey: fields.coalescingKey,
          leaseOwner: null,
          leaseExpiresAt: null,
          failureClass: null,
          requeuedCount: 0,
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    if (!result) throw new Error("Enqueue did not return a job record");
    const job = JobRecordSchema.parse(result);
    wakeIfPending(job);
    return job;
  }

  // User-initiated enqueue that must do something even when a coalescing key
  // already exists. Three ordered, state-guarded writes (no transaction): the
  // unique coalescingKey index makes each path idempotent. A state flip can
  // mislabel the outcome; the late boost after enqueue closes the
  // claimed→pending race that would otherwise leave background priority
  // untouched (see scheduleRetry).
  async enqueueUrgent(
    input: JobEnqueue,
  ): Promise<{ job: JobRecord; outcome: EnqueueUrgentOutcome }> {
    const fields = JobEnqueueSchema.parse(input);
    const now = fields.runAfter;
    const boostPending = () =>
      this.#boostPending(fields.coalescingKey, now, fields.priority);

    // pending → boost. Wart: this short-circuits retry backoff, but attempt is
    // untouched so the ladder still terminates.
    const boosted = await boostPending();
    if (boosted.matchedCount === 1) {
      const result = await this.#requireByKey(
        fields.coalescingKey,
        "boosted",
        "Boosted job disappeared after update",
      );
      wakeIfPending(result.job);
      return result;
    }

    // failed → revive. Frees the coalescing key that durable failures hold
    // (see sync-job-dispatch.service.ts). Leaves requeuedCount alone: that is
    // the sweep's budget, and a human should neither spend it nor be blocked
    // by an exhausted one.
    const revived = await this.collection.updateOne(
      { coalescingKey: fields.coalescingKey, state: "failed" },
      {
        $set: {
          state: "pending",
          runAfter: now,
          attempt: 0,
          leaseOwner: null,
          leaseExpiresAt: null,
          failureClass: null,
        },
        $unset: { lastError: "", lastErrorAt: "" },
        $max: { priority: fields.priority },
        $currentDate: { updatedAt: true },
      },
    );
    if (revived.matchedCount === 1) {
      const result = await this.#requireByKey(
        fields.coalescingKey,
        "requeuedFailed",
        "Revived job disappeared after update",
      );
      wakeIfPending(result.job);
      return result;
    }

    // claimed → inFlight. Touch nothing: releaseOwned/complete/scheduleRetry
    // are owner-scoped and racing them is how a finished job gets flipped
    // back to pending.
    const inFlight = await this.collection.findOne({
      coalescingKey: fields.coalescingKey,
      state: "claimed",
    });
    if (inFlight) {
      return { job: JobRecordSchema.parse(inFlight), outcome: "inFlight" };
    }

    const created = await this.enqueue(fields);

    // claimed→pending (scheduleRetry) or a concurrent insert may have landed
    // a background-priority / future-runAfter row that enqueue's $setOnInsert
    // left untouched. Only boost when the returned row still needs it —
    // $currentDate would make modifiedCount unreliable as the signal.
    if (
      created.state === "pending" &&
      (created.priority < fields.priority ||
        created.runAfter.getTime() > now.getTime())
    ) {
      await boostPending();
      const result = await this.#requireByKey(
        fields.coalescingKey,
        "boosted",
        "Job disappeared after late boost",
      );
      wakeIfPending(result.job);
      return result;
    }

    if (created.state === "claimed") {
      return { job: created, outcome: "inFlight" };
    }

    return { job: created, outcome: "created" };
  }

  // Urgent like a user refresh, except a periodic foreground safety tick must
  // never revive a terminal job and create an unbounded retry ladder. Races
  // are harmless: enqueue is coalesced, and the final row decides the outcome.
  async enqueueForeground(
    input: JobEnqueue,
  ): Promise<{ job: JobRecord; outcome: EnqueueForegroundOutcome }> {
    const fields = JobEnqueueSchema.parse(input);
    const now = fields.runAfter;
    const boostPending = async (missing: string) => {
      await this.#boostPending(fields.coalescingKey, now, fields.priority);
      const result = await this.#requireByKey(
        fields.coalescingKey,
        "boosted" as const,
        missing,
      );
      wakeIfPending(result.job);
      return result;
    };

    // Read first, then branch. Unlike enqueueUrgent this path has no failed →
    // revive write, so a blind boost/revive pair would cost two extra round
    // trips per resource on the common no-existing-row path — and this runs
    // for every stale resource of every connected principal.
    const existing = await this.collection.findOne({
      coalescingKey: fields.coalescingKey,
    });
    if (existing?.state === "failed") {
      return { job: JobRecordSchema.parse(existing), outcome: "failed" };
    }
    if (existing?.state === "claimed") {
      return { job: JobRecordSchema.parse(existing), outcome: "inFlight" };
    }
    if (existing?.state === "pending") {
      return boostPending("Foreground job disappeared after boost");
    }

    // The row may have appeared, been claimed, or failed since the read above.
    // enqueue() coalesces on the unique key, so the row it returns — not the
    // stale read — decides the outcome. By elimination the remaining state is
    // pending, which the late boost brings up to user priority.
    const created = await this.enqueue(fields);
    if (created.state === "failed") return { job: created, outcome: "failed" };
    if (created.state === "claimed") {
      return { job: created, outcome: "inFlight" };
    }
    if (created.priority < fields.priority || created.runAfter > now) {
      return boostPending("Foreground job disappeared after late boost");
    }
    return { job: created, outcome: "created" };
  }

  // The one boost write behind both urgent enqueue paths. $min pulls a future
  // runAfter back without robbing an older job of its place; $max can never
  // demote. Guarded on `pending`, so it can never disturb a claimed row's
  // lease or resurrect a failed one.
  #boostPending(coalescingKey: string, runAfter: Date, priority: number) {
    return this.collection.updateOne(
      { coalescingKey, state: "pending" },
      {
        $min: { runAfter },
        $max: { priority },
        $currentDate: { updatedAt: true },
      },
    );
  }

  // Re-read a coalesced row after a blind, state-guarded write. The row is
  // expected to exist, so absence is an invariant break, not a miss.
  async #requireByKey<O extends string>(
    coalescingKey: string,
    outcome: O,
    missing: string,
  ): Promise<{ job: JobRecord; outcome: O }> {
    const job = await this.collection.findOne({ coalescingKey });
    if (!job) throw new Error(missing);
    return { job: JobRecordSchema.parse(job), outcome };
  }

  async findById(
    tenantId: TenantId,
    principalId: PrincipalId,
    id: SyncJobId,
  ): Promise<JobRecord | null> {
    const record = await this.collection.findOne({
      _id: id,
      tenantId,
      principalId,
    });
    return record ? JobRecordSchema.parse(record) : null;
  }

  // Remove a job by id (operator tooling: manage-failed-jobs clear). Deleting
  // by _id AND coalescingKey guarantees we only remove the intended job, never
  // a fresh one another worker may have enqueued under the same key.
  async remove(id: SyncJobId, coalescingKey: string): Promise<boolean> {
    const result = await this.collection.deleteOne({ _id: id, coalescingKey });
    return result.deletedCount === 1;
  }

  // Atomically claim the next due job for one worker. A job is due when it's
  // pending and its runAfter has passed, OR it's claimed but its lease has
  // expired (the previous owner crashed).
  //
  // Arms, in order (arm order IS the priority ladder):
  //   1. expired lease reclaim — must run first so a sustained pending backlog
  //      cannot starve crash recovery (a coalesced resource stuck in
  //      claimed-with-expired-lease would otherwise never get a fresh pending
  //      row).
  //   2. user-priority pending (priority > background) — Refresh / post-OAuth.
  //   3. any remaining due pending (background sweeps, webhooks, followups).
  //
  // Priority is a residual FILTER inside the pending arms, not a sort key.
  // The index `state_runafter_priority` is `{state, runAfter, priority:-1}`
  // and serves `state` equality + `runAfter` range in index order; sorting by
  // `{priority:-1, runAfter:1}` cannot use that index and forced an in-memory
  // sort over every due job on every idle poll (440 docs after the 2026-08-07
  // restart burst). Sort is `{runAfter:1}` so oldest-due wins within a rung.
  // findOneAndUpdate stays atomic per arm, so two workers still never both
  // win the same job. Returns null when no job is due. An idle queue is
  // detected with one indexed find before any claim write, so a quiet
  // process does not issue three no-op findOneAndUpdate commands per poll.
  // excludeKinds reserves this lane away from the given job kinds — a light
  // lane that claims only quick jobs, so a long initialImport/repair claimed
  // by another lane can never head-of-line block it. Applied to all three
  // claim arms, including the expired-lease reclaim arm, so a light lane
  // never adopts a stalled long-running job either.
  async claimDueJob(
    owner: string,
    now: Date,
    leaseDurationMs: number,
    excludeKinds?: JobRecord["kind"][],
  ): Promise<JobRecord | null> {
    const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);
    const claimUpdate = {
      $set: { state: "claimed" as const, leaseOwner: owner, leaseExpiresAt },
      $inc: { attempt: 1 },
      $currentDate: { updatedAt: true as const },
    };
    const claimOpts = {
      sort: { runAfter: 1 as const },
      returnDocument: "after" as const,
    };
    const kindFilter =
      excludeKinds && excludeKinds.length > 0
        ? { kind: { $nin: excludeKinds } }
        : {};

    const due = await this.collection.findOne(
      {
        $or: [
          { state: "claimed" as const, leaseExpiresAt: { $lt: now } },
          { state: "pending" as const, runAfter: { $lte: now } },
        ],
        ...kindFilter,
      },
      { projection: { _id: 1 } },
    );
    if (!due) return null;

    for (const filter of [
      { state: "claimed" as const, leaseExpiresAt: { $lt: now } },
      {
        state: "pending" as const,
        runAfter: { $lte: now },
        priority: { $gt: JOB_PRIORITY.background },
      },
      { state: "pending" as const, runAfter: { $lte: now } },
    ]) {
      const claimed = await this.collection.findOneAndUpdate(
        { ...filter, ...kindFilter },
        claimUpdate,
        claimOpts,
      );
      if (claimed) return JobRecordSchema.parse(claimed);
    }
    return null;
  }

  // Extend the lease while a worker is still processing. Only the current owner
  // can heartbeat; a job reclaimed by someone else returns false.
  async heartbeat(
    id: SyncJobId,
    owner: string,
    now: Date,
    leaseDurationMs: number,
  ): Promise<boolean> {
    const result = await this.collection.updateOne(
      { _id: id, leaseOwner: owner, state: "claimed" },
      {
        $set: { leaseExpiresAt: new Date(now.getTime() + leaseDurationMs) },
        $currentDate: { updatedAt: true },
      },
    );
    return result.modifiedCount === 1;
  }

  // Finish a job the worker owns. Scoped to the owner so a job reclaimed after a
  // stale lease isn't deleted out from under its new owner.
  async complete(id: SyncJobId, owner: string): Promise<boolean> {
    const result = await this.collection.deleteOne({
      _id: id,
      leaseOwner: owner,
    });
    return result.deletedCount === 1;
  }

  // Reschedule a job the worker owns for a later retry, returning it to the
  // pending pool and releasing the lease.
  async scheduleRetry(
    id: SyncJobId,
    owner: string,
    runAfter: Date,
    lastError?: string | null,
    at: Date = new Date(),
  ): Promise<boolean> {
    const result = await this.collection.updateOne(
      { _id: id, leaseOwner: owner },
      {
        $set: {
          state: "pending",
          runAfter,
          leaseOwner: null,
          leaseExpiresAt: null,
          failureClass: "retryableTransient" as const,
          ...(lastError ? { lastError } : {}),
        },
        $min: { lastErrorAt: at },
        $currentDate: { updatedAt: true },
      },
    );
    return result.modifiedCount === 1;
  }

  // Mark a job the worker owns as a terminal failure needing attention
  // (retries exhausted).
  async fail(
    id: SyncJobId,
    owner: string,
    lastError?: string | null,
    at: Date = new Date(),
  ): Promise<boolean> {
    const result = await this.collection.updateOne(
      { _id: id, leaseOwner: owner },
      {
        $set: {
          state: "failed",
          leaseOwner: null,
          leaseExpiresAt: null,
          failureClass: "retryableTransient" as const,
          ...(lastError ? { lastError } : {}),
        },
        $min: { lastErrorAt: at },
        $currentDate: { updatedAt: true },
      },
    );
    return result.modifiedCount === 1;
  }

  // On graceful shutdown, return every job this worker still holds to the
  // pending pool so another worker (or the restarted process) picks them up
  // immediately instead of waiting for the lease to expire.
  //
  // Precondition: the caller must drain all in-flight job handlers for this
  // worker BEFORE calling releaseOwned. Running it concurrently with an
  // in-flight complete()/scheduleRetry() can flip a just-finished job back to
  // pending (the completion then no-ops because the lease is cleared), causing
  // another worker to reprocess already-done work.
  async releaseOwned(owner: string): Promise<number> {
    const result = await this.collection.updateMany(
      { leaseOwner: owner, state: "claimed" },
      {
        $set: { state: "pending", leaseOwner: null, leaseExpiresAt: null },
        $currentDate: { updatedAt: true },
      },
    );
    return result.modifiedCount;
  }

  // Failed jobs the self-heal sweep should give a fresh retry ladder: still
  // failed (a concurrent operator/reconnect action may have moved it on),
  // last due before the sweep's cooldown cutoff (`before`), and under the
  // requeue cap. Gated on `runAfter` rather than `updatedAt` — the latter is set via
  // $currentDate (real wall-clock, not the injected `now` used everywhere
  // else) and is pure audit metadata, never a field business logic reads.
  // Oldest-due-first so a long-wedged job is healed before a recently-failed
  // one.
  async listFailedForRequeue(
    before: Date,
    maxRequeues: number,
    limit: number,
  ): Promise<JobRecord[]> {
    const rows = await this.collection
      .find({
        state: "failed",
        // A job predating the requeuedCount field has been requeued zero
        // times, not too many. Mongo's {$lt: n} does not match a missing
        // field, so the absence has to be spelled out — otherwise the very
        // jobs most likely to be wedged (the oldest ones) are the only ones
        // the self-heal sweep can never see.
        $or: [
          { requeuedCount: { $lt: maxRequeues } },
          { requeuedCount: { $exists: false } },
        ],
        runAfter: { $lte: before },
      })
      .sort({ runAfter: 1 })
      .limit(limit)
      .toArray();
    return rows.map((row) => JobRecordSchema.parse(row));
  }

  // Give a failed job a fresh attempt budget and return it to the pending
  // pool, bumping requeuedCount (NOT reset by this — that is the sweep's
  // budget, distinct from the per-worker attempt count this clears). Scoped
  // to state:"failed" so a job an operator or reconnect already moved on is
  // left alone. Reusing the same _id/coalescingKey in place, rather than
  // remove+enqueue, means the sweep never has to race the coalescing key's
  // $setOnInsert uniqueness against a fresh notification for the same
  // resource.
  async requeue(id: SyncJobId, now: Date): Promise<boolean> {
    const result = await this.collection.updateOne(
      { _id: id, state: "failed" },
      {
        $set: {
          state: "pending",
          runAfter: now,
          attempt: 0,
          leaseOwner: null,
          leaseExpiresAt: null,
          failureClass: null,
        },
        $unset: { lastError: "", lastErrorAt: "" },
        $inc: { requeuedCount: 1 },
        $currentDate: { updatedAt: true },
      },
    );
    return result.modifiedCount === 1;
  }

  // Failed jobs that exhausted the self-heal requeue budget and re-failed —
  // the sweep will not touch them again; an operator must. Used to drive a
  // loud, recurring alert rather than a silent terminal state.
  async countExhaustedFailed(maxRequeues: number): Promise<number> {
    return this.collection.countDocuments(exhaustedFailedFilter(maxRequeues));
  }

  // Same filter as countExhaustedFailed, returning the rows an operator needs
  // to clear or requeue (bounded so the sweep log stays readable).
  async listExhaustedFailed(
    maxRequeues: number,
    limit = 50,
  ): Promise<ExhaustedFailedJob[]> {
    const rows = await this.collection
      .find(exhaustedFailedFilter(maxRequeues))
      .sort({ updatedAt: 1 })
      .limit(limit)
      .project({
        _id: 1,
        coalescingKey: 1,
        connectionId: 1,
        tenantId: 1,
        principalId: 1,
        failureClass: 1,
        requeuedCount: 1,
        updatedAt: 1,
      })
      .toArray();

    return rows.map((row) => ({
      id: row["_id"] as SyncJobId,
      coalescingKey: String(row["coalescingKey"]),
      connectionId: row["connectionId"] as ConnectionId,
      tenantId: row["tenantId"] as TenantId,
      principalId: row["principalId"] as PrincipalId,
      failureClass: (row["failureClass"] ?? "retryableTransient") as Exclude<
        JobRecord["failureClass"],
        null
      >,
      requeuedCount: Number(row["requeuedCount"] ?? 0),
      updatedAt:
        row["updatedAt"] instanceof Date ? row["updatedAt"] : new Date(0),
    }));
  }

  async countFailedByConnection(
    tenantId: TenantId,
    principalId: PrincipalId,
    connectionId: ConnectionId,
  ): Promise<number> {
    return this.collection.countDocuments({
      tenantId,
      principalId,
      connectionId,
      state: "failed",
    });
  }

  async countExhaustedFailedByConnection(
    tenantId: TenantId,
    principalId: PrincipalId,
    connectionId: ConnectionId,
    maxRequeues: number,
  ): Promise<number> {
    return this.collection.countDocuments({
      tenantId,
      principalId,
      connectionId,
      ...exhaustedFailedFilter(maxRequeues),
    });
  }

  // Revive every failed job for a connection, of any kind — not just the
  // incrementalPull rows enqueueUrgent's coalescing-key revive already
  // covers. A manual refresh is the user's explicit signal that the
  // connection should try again, so a wedged calendarListSync/initialImport/
  // repair/subscriptionMaintain row should not stay stuck holding its
  // coalescing key just because it isn't the kind refresh happens to
  // re-enqueue. Leaves requeuedCount alone, matching enqueueUrgent's revive
  // arm: that counter is the self-heal sweep's own budget, not a human's.
  async requeueFailedByConnection(
    tenantId: TenantId,
    principalId: PrincipalId,
    connectionId: ConnectionId,
    now: Date,
  ): Promise<number> {
    const result = await this.collection.updateMany(
      { tenantId, principalId, connectionId, state: "failed" },
      {
        $set: {
          state: "pending",
          runAfter: now,
          attempt: 0,
          leaseOwner: null,
          leaseExpiresAt: null,
          failureClass: null,
        },
        $unset: { lastError: "", lastErrorAt: "" },
        $currentDate: { updatedAt: true },
      },
    );
    return result.modifiedCount;
  }

  // Operator tooling only — looks up by id without tenant/principal scope.
  // Prefer findById(tenantId, principalId, id) for request-path reads.
  async findByIdUnscoped(id: SyncJobId): Promise<JobRecord | null> {
    const row = await this.collection.findOne({ _id: id });
    return row ? JobRecordSchema.parse(row) : null;
  }

  // The oldest piece of overdue work for one connection, if any: a pending
  // job past its runAfter, a claimed job whose lease lapsed, ANY failed job,
  // or a retrying job that already recorded lastErrorAt (so first-import
  // retries surface as delayed after DELAYED_THRESHOLD_MS instead of sitting
  // on "importing" for the whole 20-attempt ladder).
  //
  // Failed jobs must not use a just-stamped lastErrorAt as their due time —
  // that would hide a terminal fail behind DELAYED_THRESHOLD_MS. Use the
  // older of runAfter and lastErrorAt so a dead-letter whose last retry was
  // recent still alarms from the first error.
  async findOldestOverdueByConnection(
    tenantId: TenantId,
    principalId: PrincipalId,
    connectionId: ConnectionId,
    now: Date,
  ): Promise<{
    runAfter: Date;
    failureClass: JobRecord["failureClass"];
  } | null> {
    const scope = { tenantId, principalId, connectionId };
    const candidates: Array<{
      runAfter: Date;
      failureClass: JobRecord["failureClass"];
    }> = [];

    const retrying = await this.collection.findOne(
      {
        ...scope,
        lastErrorAt: { $lte: now },
        $or: [
          { state: "pending" },
          { state: "claimed", leaseExpiresAt: { $lt: now } },
        ],
      },
      {
        sort: { lastErrorAt: 1 },
        projection: { lastErrorAt: 1, failureClass: 1 },
      },
    );
    if (retrying?.["lastErrorAt"] instanceof Date) {
      candidates.push({
        runAfter: retrying["lastErrorAt"],
        failureClass: (retrying["failureClass"] ??
          "retryableTransient") as JobRecord["failureClass"],
      });
    }

    const result = await this.collection.findOne(
      {
        ...scope,
        $or: [
          { state: "pending", runAfter: { $lte: now } },
          { state: "claimed", leaseExpiresAt: { $lt: now } },
          { state: "failed" },
        ],
      },
      {
        sort: { runAfter: 1 },
        projection: { runAfter: 1, lastErrorAt: 1, failureClass: 1, state: 1 },
      },
    );
    if (result?.["runAfter"] instanceof Date) {
      const lastErrorAt =
        result["lastErrorAt"] instanceof Date ? result["lastErrorAt"] : null;
      const runAfter =
        result["state"] === "failed" &&
        lastErrorAt &&
        lastErrorAt.getTime() < result["runAfter"].getTime()
          ? lastErrorAt
          : result["runAfter"];
      candidates.push({
        runAfter,
        failureClass: result["failureClass"] ?? null,
      });
    }

    if (candidates.length === 0) return null;
    return candidates.reduce((oldest, next) =>
      next.runAfter.getTime() < oldest.runAfter.getTime() ? next : oldest,
    );
  }

  // Outstanding work for one connection (support diagnostics / S45).
  async countOutstandingByConnection(
    tenantId: TenantId,
    principalId: PrincipalId,
    connectionId: ConnectionId,
  ): Promise<number> {
    return this.collection.countDocuments({
      tenantId,
      principalId,
      connectionId,
      state: { $in: ["pending", "claimed"] },
    });
  }

  // Read work that makes a connected calendar's freshness unknown. Command
  // writes and subscription renewal are intentionally excluded: they should
  // not turn an otherwise current sidebar into a broad "Syncing" state.
  async hasOutstandingReadWorkByConnection(
    tenantId: TenantId,
    principalId: PrincipalId,
    connectionId: ConnectionId,
  ): Promise<boolean> {
    const job = await this.collection.findOne(
      {
        tenantId,
        principalId,
        connectionId,
        state: { $in: ["pending", "claimed"] },
        kind: {
          $in: [
            "calendarListSync",
            "initialImport",
            "bootstrapCatchup",
            "incrementalPull",
            "repair",
          ],
        },
      },
      { projection: { _id: 1 } },
    );
    return job !== null;
  }

  // Hard-delete every job for one connection (post-disconnect retention).
  async deleteByConnection(
    tenantId: TenantId,
    principalId: PrincipalId,
    connectionId: ConnectionId,
  ): Promise<number> {
    const result = await this.collection.deleteMany({
      tenantId,
      principalId,
      connectionId,
    });
    return result.deletedCount;
  }

  // Hard-delete every job for a principal (account deletion).
  async deleteByPrincipal(
    tenantId: TenantId,
    principalId: PrincipalId,
  ): Promise<number> {
    const result = await this.collection.deleteMany({ tenantId, principalId });
    return result.deletedCount;
  }
}

function wakeIfPending(job: JobRecord): void {
  if (job.state === "pending") signalJobQueueWake();
}
