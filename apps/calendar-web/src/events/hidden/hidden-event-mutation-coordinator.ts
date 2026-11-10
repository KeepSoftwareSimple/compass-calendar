/** Serializes remote hidden-event writes per event id and tracks the latest intent. */

type HiddenIntent = {
  seq: number;
  hidden: boolean;
};

const intentByEventId = new Map<string, HiddenIntent>();
const chainsByEventId = new Map<string, Promise<unknown>>();

let nextSeq = 0;

export function registerHiddenEventIntent(
  eventId: string,
  hidden: boolean,
): number {
  const seq = ++nextSeq;
  intentByEventId.set(eventId, { seq, hidden });
  return seq;
}

export function hiddenEventIntentStillCurrent(
  eventId: string,
  seq: number,
  hidden: boolean,
): boolean {
  const intent = intentByEventId.get(eventId);
  return intent?.seq === seq && intent.hidden === hidden;
}

export function clearHiddenEventIntentIfCurrent(
  eventId: string,
  seq: number,
  hidden: boolean,
): void {
  if (hiddenEventIntentStillCurrent(eventId, seq, hidden)) {
    intentByEventId.delete(eventId);
  }
}

function applyHiddenToIds(
  ids: readonly string[],
  eventId: string,
  hidden: boolean,
): readonly string[] {
  if (hidden) {
    return ids.includes(eventId) ? ids : [...ids, eventId];
  }
  return ids.filter((id) => id !== eventId);
}

/** Apply in-flight intents so a refetch cannot clobber optimistic state. */
export function mergePendingHiddenIntents(
  ids: readonly string[],
): readonly string[] {
  let merged = ids;
  for (const [eventId, { hidden }] of intentByEventId) {
    merged = applyHiddenToIds(merged, eventId, hidden);
  }
  return merged;
}

/** Test visibility for pending intent merge assertions. */
export function hasPendingHiddenIntent(eventId: string): boolean {
  return intentByEventId.has(eventId);
}

export async function runHiddenEventMutation<T>(
  eventId: string,
  work: () => Promise<T>,
): Promise<T> {
  const prior = chainsByEventId.get(eventId) ?? Promise.resolve();
  const run = prior.catch(() => undefined).then(work);
  chainsByEventId.set(eventId, run);
  try {
    return await run;
  } finally {
    if (chainsByEventId.get(eventId) === run) {
      chainsByEventId.delete(eventId);
    }
  }
}

/** Visible to unit tests only: reset module state between cases. */
export function resetHiddenEventMutationCoordinatorForTests(): void {
  intentByEventId.clear();
  chainsByEventId.clear();
  nextSeq = 0;
}
