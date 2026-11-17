import { refreshConnectionStateAfterJob } from "@sync/domain/connection-state-refresh.service";
import { sanitizeJobLastError } from "@sync/domain/job-last-error";
import {
  dispatchSyncJob,
  type SyncJobDispatchDeps,
} from "@sync/domain/sync-job-dispatch.service";
import { isTransientSyncJobError } from "@sync/providers/provider-transient-error.util";
import { type JobRecord } from "@sync/storage/contracts/job.contracts";
import { type JobRepository } from "@sync/storage/repositories/job.repository";

export interface SyncJobWorkerDeps extends SyncJobDispatchDeps {
  jobs: JobRepository;
}

export interface SyncJobWorkerOptions {
  // How long a claimed job's lease lasts. A job still making progress keeps its
  // lease alive via the heartbeat below, so this only needs to outlast the gap
  // between heartbeats. A job that outlives its lease anyway (its worker stalled
  // or crashed) is reclaimed and re-run — safe, because every engine is
  // idempotent, just wasteful.
  leaseMs?: number;
  // How often to extend a claimed job's lease while it is still running. Must be
  // comfortably shorter than leaseMs so the lease never lapses under a long
  // import/repair. Defaults to a third of the lease.
  heartbeatMs?: number;
  // Injectable timer so tests can drive the heartbeat deterministically. Given a
  // callback and an interval, it returns a function that stops the timer.
  // Defaults to setInterval/clearInterval.
  scheduleHeartbeat?: (beat: () => void, everyMs: number) => () => void;
  // When to retry a job that asked to be retried, from its attempt count. The
  // default is a capped exponential with jitter (so a burst of jobs that failed
  // together do not all retry in lockstep). Tests inject a deterministic one.
  backoff?: (attempt: number, now: Date) => Date;
  // How many times a transient failure is retried before the job is marked a
  // terminal failure needing attention. Bounds retries so a persistently-failing
  // job cannot loop forever.
  maxAttempts?: number;
  // Injectable [0,1) source so a test can pin the backoff jitter; defaults to
  // Math.random.
  random?: () => number;
  now?: () => Date;
  // Called when a job engine throws (before the worker schedules a retry). The
  // scheduler's drain onError only sees claim/settle failures; per-job engine
  // throws were previously swallowed, which left staging imports opaque. Takes
  // the job (mirroring onDrop below) so a caller can log identifiers without
  // parsing them back out of the error message. Skipped for transient provider
  // failures that still have retries left; use onTransientRetry for those.
  onError?: (error: unknown, job: JobRecord) => void;
  // Transient provider failure with retries remaining: log at warn, not error.
  onTransientRetry?: (error: unknown, job: JobRecord) => void;
  // Called when dispatch drops a job (settled complete without doing its work:
  // vanished target, unusable credential). Drops are correct behavior, but an
  // invisible drop path made a mass credential problem look like a dead sweep
  // (2026-07-29) — surface them.
  onDrop?: (job: JobRecord, reason: string) => void;
  // Called when a job exhausts its retries and settles into a terminal
  // failure (before the fail() write). Unlike onError (fires every attempt),
  // this fires exactly once, on the exhausting attempt — the signal worth
  // alerting on, since the job is now wedged until an operator or a manual
  // refresh revives it. The error is the last engine throw or retry reason.
  onFail?: (job: JobRecord, error?: unknown) => void;
  // Reserve this worker away from the given job kinds — see
  // JobRepository.claimDueJob. Used to keep a subset of drains claiming only
  // quick jobs (pulls), so a long initialImport/repair elsewhere can never
  // head-of-line block them.
  excludeKinds?: JobRecord["kind"][];
}

const DEFAULT_LEASE_MS = 5 * 60_000;
// A third of the lease: up to two heartbeats can be missed before the lease
// lapses, so a single hiccup does not trigger a spurious reclaim.
const DEFAULT_HEARTBEAT_DIVISOR = 3;
const DEFAULT_MAX_ATTEMPTS = 20;

// Real timer used when the caller injects none.
const setIntervalHeartbeat = (
  beat: () => void,
  everyMs: number,
): (() => void) => {
  const id = setInterval(beat, everyMs);
  return () => clearInterval(id);
};
const BACKOFF_BASE_MS = 10_000;
const BACKOFF_CAP_MS = 10 * 60_000;
const BACKOFF_JITTER_RATIO = 0.2;

// Capped exponential backoff with jitter. attempt is >= 1 (claimDueJob increments
// it on every claim), so the first retry waits ~BACKOFF_BASE_MS. The jitter
// (delay * (1 ± ratio)) spreads jobs that failed together — e.g. a whole
// provider outage — so they do not retry in a synchronized thundering herd.
function jitteredBackoff(
  attempt: number,
  now: Date,
  random: () => number,
): Date {
  const exp = Math.min(attempt - 1, 6);
  const base = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** exp);
  const swing = BACKOFF_JITTER_RATIO * (random() * 2 - 1);
  const delay = Math.max(0, Math.round(base * (1 + swing)));
  return new Date(now.getTime() + delay);
}

// Drains the job queue: claim a due job, run it through dispatch, and settle it
// (delete on success, reschedule on transient failure, mark failed once retries
// are exhausted or the failure is permanent). One worker owns a lease; several
// can run concurrently and never both win the same job (claimDueJob is atomic).
// A heartbeat keeps a long-running job's lease alive while it works (see
// #process), so it is not reclaimed and re-run mid-flight.
export class SyncJobWorker {
  readonly #deps: SyncJobWorkerDeps;
  readonly #owner: string;
  readonly #leaseMs: number;
  readonly #heartbeatMs: number;
  readonly #scheduleHeartbeat: (
    beat: () => void,
    everyMs: number,
  ) => () => void;
  readonly #maxAttempts: number;
  readonly #backoff: (attempt: number, now: Date) => Date;
  readonly #now: () => Date;
  readonly #onError: (error: unknown, job: JobRecord) => void;
  readonly #onTransientRetry: (error: unknown, job: JobRecord) => void;
  readonly #onDrop: (job: JobRecord, reason: string) => void;
  readonly #onFail: (job: JobRecord, error?: unknown) => void;
  readonly #excludeKinds?: JobRecord["kind"][];

  constructor(
    deps: SyncJobWorkerDeps,
    owner: string,
    options: SyncJobWorkerOptions = {},
  ) {
    this.#deps = deps;
    this.#owner = owner;
    this.#leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
    this.#heartbeatMs =
      options.heartbeatMs ??
      Math.floor(this.#leaseMs / DEFAULT_HEARTBEAT_DIVISOR);
    this.#scheduleHeartbeat = options.scheduleHeartbeat ?? setIntervalHeartbeat;
    this.#maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    const random = options.random ?? Math.random;
    this.#backoff =
      options.backoff ??
      ((attempt, now) => jitteredBackoff(attempt, now, random));
    this.#now = options.now ?? (() => new Date());
    this.#onError = options.onError ?? (() => {});
    this.#onTransientRetry = options.onTransientRetry ?? (() => {});
    this.#onDrop = options.onDrop ?? (() => {});
    this.#onFail = options.onFail ?? (() => {});
    this.#excludeKinds = options.excludeKinds;
  }

  // Claim and process at most one due job. Returns "idle" when nothing is due.
  async runOnce(): Promise<"idle" | "processed"> {
    const job = await this.#deps.jobs.claimDueJob(
      this.#owner,
      this.#now(),
      this.#leaseMs,
      this.#excludeKinds,
    );
    if (!job) return "idle";
    await this.#process(job);
    return "processed";
  }

  // Drain due jobs up to a bound (a safety valve against a self-refilling queue
  // starving the caller). Returns how many were processed.
  async drain(max = 100): Promise<number> {
    let processed = 0;
    while (processed < max) {
      const outcome = await this.runOnce();
      if (outcome === "idle") break;
      processed += 1;
    }
    return processed;
  }

  async #process(job: JobRecord): Promise<void> {
    // Keep the lease alive while the job runs, so a long import/repair that
    // outlasts a single lease is not reclaimed and redundantly re-run (wasting
    // provider quota) by another worker. A heartbeat failure is non-fatal — the
    // lease simply lapses and the job is reclaimed, same as before this existed.
    // The beat returns the heartbeat promise (so a test can await one tick); the
    // default setInterval ignores it. A heartbeat rejection is swallowed here so
    // an unhandled rejection can never crash the worker.
    const stopHeartbeat = this.#scheduleHeartbeat(
      () =>
        this.#deps.jobs
          .heartbeat(job._id, this.#owner, this.#now(), this.#leaseMs)
          .then(() => {})
          .catch(() => {}),
      this.#heartbeatMs,
    );
    try {
      await this.#runJob(job);
    } finally {
      stopHeartbeat();
    }
  }

  async #runJob(job: JobRecord): Promise<void> {
    let outcome: Awaited<ReturnType<typeof dispatchSyncJob>>;
    try {
      outcome = await dispatchSyncJob(this.#deps, job, this.#now);
    } catch (error) {
      // An engine threw (a transient provider/storage error dispatch does not
      // model as a status). Treat it as retryable; the cap still bounds it.
      // The sanitized cause goes in the MESSAGE, not just `cause`: the PostHog
      // exception title is built from the message alone, so without it every
      // failure kind collapses into one opaque "attempt N failed" issue and
      // the real error hides in event properties.
      const lastError = sanitizeJobLastError(error);
      const wrapped = new Error(
        `Sync job ${job.kind} (${job._id}) attempt ${job.attempt} failed${
          lastError ? `: ${lastError}` : ""
        }`,
        { cause: error instanceof Error ? error : undefined },
      );
      const willRetry =
        isTransientSyncJobError(wrapped) && job.attempt < this.#maxAttempts;
      if (willRetry) {
        this.#onTransientRetry(wrapped, job);
      } else {
        this.#onError(wrapped, job);
      }
      await this.#settleFailure(job, error);
      return;
    }

    switch (outcome.result) {
      case "done":
        // Enqueue the followup (if any) BEFORE completing this job: the enqueue
        // is idempotent (coalesced), so a crash between the two re-runs this
        // idempotent job and re-enqueues the same followup, whereas completing
        // first then crashing would drop the followup.
        if (outcome.followup) await this.#deps.jobs.enqueue(outcome.followup);
        await this.#deps.jobs.complete(job._id, this.#owner);
        await refreshConnectionStateAfterJob(this.#deps, job, this.#now);
        return;
      case "drop":
        // Nothing to do (target vanished, credential unusable); settle so it
        // never retries — but say so, or a mass drop is indistinguishable from
        // a stalled queue.
        this.#onDrop(job, outcome.reason);
        await this.#deps.jobs.complete(job._id, this.#owner);
        await refreshConnectionStateAfterJob(this.#deps, job, this.#now);
        return;
      case "fail":
        this.#onFail(job, new Error(outcome.reason));
        await this.#deps.jobs.fail(
          job._id,
          this.#owner,
          outcome.reason,
          this.#now(),
        );
        await refreshConnectionStateAfterJob(this.#deps, job, this.#now);
        return;
      case "retry":
        await this.#settleFailure(job, new Error(outcome.reason));
        return;
    }
  }

  // Reschedule a failed job for a backed-off retry, OR mark it a terminal
  // failure once retries are exhausted. A failed job keeps its coalescing key,
  // so enqueue will not create a replacement until an operator clears it —
  // deliberate backpressure: a persistently-broken resource stops and asks for
  // attention rather than looping (or resurrecting on every sweep, which would
  // be unlimited retries by another name). After either settle, re-derive
  // connection health so a first import that is retrying or dead-lettered is
  // not stuck on "importing" in the SPA.
  async #settleFailure(job: JobRecord, error?: unknown): Promise<void> {
    const lastError = sanitizeJobLastError(error);
    if (job.attempt >= this.#maxAttempts) {
      this.#onFail(job, error);
      await this.#deps.jobs.fail(job._id, this.#owner, lastError, this.#now());
      await refreshConnectionStateAfterJob(this.#deps, job, this.#now);
      return;
    }
    await this.#deps.jobs.scheduleRetry(
      job._id,
      this.#owner,
      this.#backoff(job.attempt, this.#now()),
      lastError,
      this.#now(),
    );
    await refreshConnectionStateAfterJob(this.#deps, job, this.#now);
  }
}
