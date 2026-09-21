// The shared shape behind every background loop in Sync: tick, then either
// loop again immediately or idle before the next tick, until stopped. Both the
// job-drain scheduler and the periodic sweep scheduler (reconcile,
// subscription maintenance, retention, health snapshot) are this same
// #running/#loop/#wake/#timer skeleton around a different tick — this is the
// one loop, injected with what to do, how long to wait after, and any
// teardown once it has fully stopped.
export interface PollLoopOptions {
  // Do one unit of work; the boolean return feeds nextDelayMs (e.g. "did this
  // drain find jobs?" for a busy-vs-idle poll interval). A sweep that always
  // waits a fixed jittered interval can ignore it.
  tick: () => Promise<boolean>;
  // How long to wait before the next tick, given whether the last one did work.
  nextDelayMs: (didWork: boolean) => number;
  // Awaited once before the first tick. Placing the delay here (rather than
  // in SweepScheduler.start) means stop() during the wait tears down cleanly
  // via the existing #idle/#wake path.
  initialDelayMs?: number;
  // A tick failure must never kill the loop; surfaced here and the loop
  // continues to the next tick.
  onError?: (error: unknown) => void;
  // Extra teardown run once stop() has waited out any in-flight tick (e.g.
  // releasing held job leases so a restart picks them up immediately).
  onStop?: () => Promise<void>;
}

export class PollLoop {
  readonly #tick: () => Promise<boolean>;
  readonly #nextDelayMs: (didWork: boolean) => number;
  readonly #initialDelayMs: number;
  readonly #onError: (error: unknown) => void;
  readonly #onStop: (() => Promise<void>) | undefined;

  #running = false;
  #loop: Promise<void> | null = null;
  #wake: (() => void) | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  // Set when wake() arrives during a tick, so the following idle wait is
  // skipped. A wake during idle resolves that wait and clears the flag.
  #kicked = false;

  constructor(options: PollLoopOptions) {
    this.#tick = options.tick;
    this.#nextDelayMs = options.nextDelayMs;
    this.#initialDelayMs = options.initialDelayMs ?? 0;
    this.#onError = options.onError ?? (() => {});
    this.#onStop = options.onStop;
  }

  // Begin ticking. Idempotent: a second call while running is a no-op, so one
  // loop never spawns two.
  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#loop = this.#run();
  }

  // Stop ticking. Waits for an in-flight tick to finish BEFORE running onStop
  // (a caller's precondition, e.g. releaseOwned, may require no handler still
  // running). Idempotent and safe to call when never started.
  async stop(): Promise<void> {
    this.#running = false;
    this.#kicked = false;
    // Resolve a pending idle wait so the loop notices #running is false at once
    // instead of sleeping out the remaining delay.
    this.#resolveIdle();
    if (this.#loop) await this.#loop;
    this.#loop = null;
    if (this.#onStop) await this.#onStop();
  }

  // End the current idle wait, or skip the next one if a tick is in flight.
  // Used when new work is enqueued so a drain does not sit out pollMs.
  wake(): void {
    if (!this.#running) return;
    this.#kicked = true;
    this.#resolveIdle();
  }

  #resolveIdle(): void {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    const wake = this.#wake;
    this.#wake = null;
    wake?.();
  }

  async #run(): Promise<void> {
    if (this.#initialDelayMs > 0) {
      await this.#idle(this.#initialDelayMs);
      if (!this.#running) return;
    }
    while (this.#running) {
      let didWork = false;
      try {
        didWork = await this.#tick();
      } catch (error) {
        // A tick failure must never kill the loop; surface it and keep going.
        this.#onError(error);
      }
      if (!this.#running) break;
      await this.#idle(this.#nextDelayMs(didWork));
    }
  }

  #idle(ms: number): Promise<void> {
    if (this.#kicked) {
      this.#kicked = false;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.#wake = () => {
        // The kick was consumed by ending this wait. Do not also skip the
        // idle that follows the next tick.
        this.#kicked = false;
        resolve();
      };
      this.#timer = setTimeout(() => {
        this.#wake = null;
        this.#timer = null;
        resolve();
      }, ms);
    });
  }
}
