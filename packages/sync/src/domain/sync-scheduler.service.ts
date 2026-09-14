import { PollLoop } from "@sync/domain/poll-loop";
import { subscribeJobQueueWake } from "@sync/storage/repositories/job.repository";

// The scheduler drains the job queue continuously: it repeatedly asks a worker
// to drain, sleeping a poll interval only when the queue is empty so a busy
// queue is worked without idle latency. It owns no sync logic — that lives in
// the worker/dispatch — only the loop (via PollLoop) and its graceful
// lifecycle.

// The slice of the worker the loop drives. Kept minimal so the scheduler is
// testable with a fake and never reaches into sync internals. SyncJobWorker
// has private fields, so a lightweight test fake can only satisfy this narrow
// structural type, never the concrete class — this interface is load-bearing,
// not incidental.
export interface JobDrainer {
  drain(max?: number): Promise<number>;
}

// The slice of the job store the scheduler needs to release its lease on stop.
// Same rationale as JobDrainer: JobRepository has a private field, so tests
// fake this narrow shape instead of the concrete repository.
export interface OwnedJobReleaser {
  releaseOwned(owner: string): Promise<number>;
}

export interface SyncSchedulerDeps {
  worker: JobDrainer;
  jobs: OwnedJobReleaser;
}

export interface SyncSchedulerOptions {
  // The lease owner this scheduler's worker claims under; its held jobs are
  // released back to pending on stop so a restart picks them up immediately.
  owner: string;
  // How long to wait between drains when the queue is empty. A busy drain loops
  // with no wait, so this only bounds idle-poll latency (the missed-webhook
  // fallback cadence is a separate, longer reconcile — a later slice).
  pollMs?: number;
  // Where a drain error goes. The loop never dies on one; it logs and continues.
  onError?: (error: unknown) => void;
}

const DEFAULT_POLL_MS = 5_000;

export class SyncScheduler {
  readonly #loop: PollLoop;
  #unsubscribeWake: (() => void) | undefined;

  constructor(deps: SyncSchedulerDeps, options: SyncSchedulerOptions) {
    const pollMs = options.pollMs ?? DEFAULT_POLL_MS;
    this.#loop = new PollLoop({
      tick: async () => (await deps.worker.drain()) > 0,
      // Loop immediately while there is work; otherwise wait a poll interval.
      nextDelayMs: (didWork) => (didWork ? 0 : pollMs),
      onError: options.onError,
      onStop: async () => {
        await deps.jobs.releaseOwned(options.owner);
      },
    });
  }

  start(): void {
    this.#unsubscribeWake ??= subscribeJobQueueWake(() => this.#loop.wake());
    this.#loop.start();
  }

  // Interrupt the idle poll so a just-enqueued job is claimed immediately.
  wake(): void {
    this.#loop.wake();
  }

  async stop(): Promise<void> {
    this.#unsubscribeWake?.();
    this.#unsubscribeWake = undefined;
    await this.#loop.stop();
  }
}
