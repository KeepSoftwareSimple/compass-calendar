import {
  type JobDrainer,
  SyncScheduler,
} from "@sync/domain/sync-scheduler.service";

const OWNER = "worker-1";

// A worker whose drain returns a scripted sequence of counts (how many jobs it
// processed), defaulting to 0 (idle) once the script runs out. Each call
// resolves a promise the test can await, so the test advances exactly when a
// drain happens — no arbitrary timers.
class FakeWorker implements JobDrainer {
  calls = 0;
  #counts: number[];
  #throwOnCall: number | null;
  #waiters: Array<(n: number) => void> = [];

  constructor(counts: number[] = [], throwOnCall: number | null = null) {
    this.#counts = counts;
    this.#throwOnCall = throwOnCall;
  }
  async drain(): Promise<number> {
    this.calls += 1;
    const call = this.calls;
    const processed = this.#counts.shift() ?? 0;
    for (const w of this.#waiters.splice(0)) w(processed);
    if (this.#throwOnCall === call) throw new Error("drain failed");
    return processed;
  }
  // Resolves on the next drain call, with the count it returned.
  nextDrain(): Promise<number> {
    return new Promise((resolve) => this.#waiters.push(resolve));
  }
}

const releaser = () => {
  const released: string[] = [];
  return {
    released,
    releaseOwned: async (owner: string) => {
      released.push(owner);
      return 0;
    },
  };
};

describe("SyncScheduler", () => {
  it("drains repeatedly while there is work, then idles", async () => {
    const worker = new FakeWorker([2, 1]); // two busy drains, then idle (0)
    const jobs = releaser();
    const scheduler = new SyncScheduler(
      { worker, jobs },
      { owner: OWNER, pollMs: 10_000 },
    );

    // The third drain returns 0 (idle); await it, then stop before the poll
    // timer would fire, so the test never waits out pollMs.
    const idleReached = (async () => {
      for (;;) {
        const n = await worker.nextDrain();
        if (n === 0) return;
      }
    })();
    scheduler.start();
    await idleReached;
    await scheduler.stop();

    expect(worker.calls).toBe(3); // 2 busy + 1 idle
  });

  it("releases its owned jobs on stop and halts the loop", async () => {
    const worker = new FakeWorker([]); // always idle
    const jobs = releaser();
    const scheduler = new SyncScheduler(
      { worker, jobs },
      { owner: OWNER, pollMs: 10_000 },
    );

    const firstDrain = worker.nextDrain();
    scheduler.start();
    await firstDrain;
    await scheduler.stop();

    expect(jobs.released).toEqual([OWNER]);
    // The loop is stopped: no further drains happen after stop resolves.
    const callsAtStop = worker.calls;
    await new Promise((r) => setTimeout(r, 0));
    expect(worker.calls).toBe(callsAtStop);
  });

  it("does not release owned jobs until an in-flight drain settles", async () => {
    // releaseOwned's precondition (job.repository.ts): racing it against a
    // still-running complete()/scheduleRetry() can flip a just-finished job
    // back to pending and reprocess it. FakeWorker cannot hold a drain open,
    // so this case needs a drainer that blocks until the test releases it.
    let resolveDrain!: () => void;
    let signalDrainStarted!: () => void;
    const drainStarted = new Promise<void>((resolve) => {
      signalDrainStarted = resolve;
    });
    const drainBlocked = new Promise<void>((resolve) => {
      resolveDrain = resolve;
    });
    const worker: JobDrainer = {
      drain: async () => {
        signalDrainStarted();
        await drainBlocked;
        return 0;
      },
    };
    const jobs = releaser();
    const scheduler = new SyncScheduler(
      { worker, jobs },
      { owner: OWNER, pollMs: 10_000 },
    );

    scheduler.start();
    await drainStarted;

    const stopping = scheduler.stop();
    // Give stop() a tick to run ahead if it were (incorrectly) not waiting on
    // the in-flight drain before releasing.
    await new Promise((r) => setTimeout(r, 0));
    expect(jobs.released).toEqual([]);

    resolveDrain();
    await stopping;

    expect(jobs.released).toEqual([OWNER]);
  });

  it("keeps looping after a drain throws", async () => {
    const errors: unknown[] = [];
    const worker = new FakeWorker([1, 0], 1); // call 1 throws, call 2 idles
    const jobs = releaser();
    // A throw leaves processed at 0, so the loop backs off by pollMs before the
    // next drain; keep it tiny so the retry is prompt (the test still awaits the
    // real drain, so timing can't make it flaky, only slow).
    const scheduler = new SyncScheduler(
      { worker, jobs },
      { owner: OWNER, pollMs: 1, onError: (e) => errors.push(e) },
    );

    const idleReached = (async () => {
      for (;;) {
        const n = await worker.nextDrain();
        if (n === 0) return;
      }
    })();
    scheduler.start();
    await idleReached;
    await scheduler.stop();

    expect(errors).toHaveLength(1); // the thrown drain was caught, not fatal
    expect(worker.calls).toBeGreaterThanOrEqual(2); // it kept going
  });

  it("wakes an idle drain instead of waiting out the poll interval", async () => {
    const worker = new FakeWorker([]);
    const jobs = releaser();
    const scheduler = new SyncScheduler(
      { worker, jobs },
      { owner: OWNER, pollMs: 10_000 },
    );

    const firstDrain = worker.nextDrain();
    scheduler.start();
    await firstDrain;

    const secondDrain = worker.nextDrain();
    const started = Date.now();
    scheduler.wake();
    expect(await secondDrain).toBe(0);
    expect(Date.now() - started).toBeLessThan(100);
    await scheduler.stop();
  });

  it("start is idempotent and stop is safe when never started", async () => {
    const worker = new FakeWorker([]);
    const jobs = releaser();
    const scheduler = new SyncScheduler(
      { worker, jobs },
      { owner: OWNER, pollMs: 10_000 },
    );

    // stop() before start(): no loop to await, but still releases (a no-op).
    await scheduler.stop();
    expect(jobs.released).toEqual([OWNER]);

    // Two starts spawn one loop; stopping once fully halts it.
    const firstDrain = worker.nextDrain();
    scheduler.start();
    scheduler.start();
    await firstDrain;
    await scheduler.stop();
    const callsAtStop = worker.calls;
    await new Promise((r) => setTimeout(r, 0));
    expect(worker.calls).toBe(callsAtStop); // not double-looping
  });
});
