// In-process signal from job enqueue to idle drains. Sync runs as one process
// today; a second replica still falls back to the poll interval.

const listeners = new Set<() => void>();

export function subscribeJobWake(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyJobsWaiting(): void {
  for (const listener of listeners) listener();
}
