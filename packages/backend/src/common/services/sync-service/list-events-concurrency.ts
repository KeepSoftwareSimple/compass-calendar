// Process-wide cap on in-flight Sync list-events calls. A single browser
// page load can fan out many range reads; without a limiter those become
// dozens of simultaneous GETs that abort mid-body and look like corrupt
// responses (2026-09-13). No new dependency: a small semaphore.

export const LIST_EVENTS_CONCURRENCY = 4;

let active = 0;
const waiters: Array<() => void> = [];

function acquire(): Promise<void> {
  if (active < LIST_EVENTS_CONCURRENCY) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    waiters.push(() => {
      active += 1;
      resolve();
    });
  });
}

function release(): void {
  active -= 1;
  const next = waiters.shift();
  if (next) next();
}

export async function runWithListEventsLimit<T>(
  work: () => Promise<T>,
): Promise<T> {
  await acquire();
  try {
    return await work();
  } finally {
    release();
  }
}
