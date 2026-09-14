import { type Mutation, type QueryClient } from "@tanstack/react-query";
import { session } from "@web/auth/compass/session/Session";
import {
  hasUserEverAuthenticated,
  markAnonymousCalendarChangeForSignUpPrompt,
} from "@web/auth/compass/state/auth.state.util";
import { maybeShowAnonymousSaveToast } from "@web/common/utils/toast/anonymous-save.toast";
import { eventMutationKeys } from "./event.mutation.keys";

const ifAnonymousGuest = async (action: () => void): Promise<void> => {
  if (await session.doesSessionExist()) return;
  if (hasUserEverAuthenticated()) return;
  action();
};

export const markAnonymousEventWrite = () =>
  ifAnonymousGuest(markAnonymousCalendarChangeForSignUpPrompt);

export const showAnonymousSaveToastIfEligible = () =>
  ifAnonymousGuest(maybeShowAnonymousSaveToast);

type AnyMutation = Mutation<unknown, Error, unknown, unknown>;

export type PrecedingEventWrites = {
  create: "success" | "error" | null;
  delete: "success" | "error" | null;
};

// An edit/delete/convert after a failed create has nothing to write against
// (the id never existed server-side); an undo-restore create after a failed
// delete has nothing to restore (the event still exists).
export const precedingCreateOk = (preceding: PrecedingEventWrites) =>
  preceding.create !== "error";

export const precedingDeleteOk = (preceding: PrecedingEventWrites) =>
  preceding.delete !== "error";

// Every serialized mutation's variables carry an explicit `writeKey` — the id
// (event id, or series id for an "all"/"thisAndFollowing"-scope replace) that
// identifies which document this write serializes against.
type WriteKeyed = { writeKey?: string };

const variablesEventId = (mutation: AnyMutation): string | undefined =>
  (mutation.state.variables as WriteKeyed | undefined)?.writeKey;

const operationOf = (mutation: AnyMutation): string | undefined => {
  const key = mutation.options.mutationKey;
  if (!Array.isArray(key)) return undefined;
  const [scope, kind, operation] = key;
  const [allScope, allKind] = eventMutationKeys.all;
  if (scope !== allScope || kind !== allKind) return undefined;
  return operation as string;
};

const whenSettled = (queryClient: QueryClient, mutation: AnyMutation) =>
  new Promise<void>((resolve) => {
    const cache = queryClient.getMutationCache();
    const unsubscribe = cache.subscribe(() => {
      if (mutation.state.status === "pending") return;
      unsubscribe();
      resolve();
    });
  });

const listEventMutations = (queryClient: QueryClient): AnyMutation[] =>
  queryClient.getMutationCache().getAll() as AnyMutation[];

const findOwnMutation = (
  mutations: AnyMutation[],
  ownVariables: unknown,
): AnyMutation | undefined =>
  mutations.find((mutation) => mutation.state.variables === ownVariables);

/**
 * Serializes repository writes per event: resolves once every event mutation
 * for `eventId` that was submitted before the caller has settled. Without
 * this, rapid successive changes to one event (drag bursts, undo/redo
 * replays) issue overlapping PUT/DELETE requests for the same document,
 * which the backend surfaces as Mongo write-conflict 500s.
 *
 * A mutation stays "pending" while it waits here itself, so transitively each
 * write runs only after the previous one finished — a serial queue ordered by
 * `mutationId` (assigned at `mutate()` time; the "earlier only" filter is
 * also what makes mutual waits, and thus deadlock, impossible).
 *
 * `ownVariables` must be the exact variables object the caller's mutationFn
 * received; it identifies the caller's own (already-registered) mutation in
 * the cache, so its `mutationId` can anchor the "earlier only" filter.
 *
 * Returns the final status of the latest preceding create and delete —
 * see `precedingCreateOk`/`precedingDeleteOk` for the outcome-dependent
 * skips callers apply to them.
 */
export async function waitForPrecedingEventWrites(
  queryClient: QueryClient,
  eventId: string,
  ownVariables: unknown,
): Promise<PrecedingEventWrites> {
  const mutations = listEventMutations(queryClient).sort(
    (a, b) => a.mutationId - b.mutationId,
  );
  const self = findOwnMutation(mutations, ownVariables);
  if (!self) {
    // react-query registers a mutation (status "pending", variables set)
    // before its mutationFn runs, so the caller is always present here.
    throw new Error("waitForPrecedingEventWrites: caller not found in cache");
  }
  const preceding = mutations.filter(
    (mutation) =>
      mutation.state.status === "pending" &&
      mutation.mutationId < self.mutationId &&
      operationOf(mutation) !== undefined &&
      variablesEventId(mutation) === eventId,
  );

  await Promise.all(
    preceding.map((mutation) => whenSettled(queryClient, mutation)),
  );

  const lastStatus = (operations: string[]) => {
    const last = preceding
      .filter((mutation) => operations.includes(operationOf(mutation) ?? ""))
      .at(-1);
    if (!last) return null;
    return last.state.status === "success"
      ? ("success" as const)
      : ("error" as const);
  };

  return {
    create: lastStatus(["create"]),
    delete: lastStatus(["delete"]),
  };
}

/**
 * True when a later edit to the same event is already queued. Writes serialize
 * by `mutationId`, so by the time an edit reaches its turn a rapid burst (held
 * arrow-key nudge, drag) may have enqueued newer edits for the same event. The
 * older edits' PUTs are then redundant — the newest edit persists the final
 * position — so callers skip them, collapsing the burst to a single network
 * write instead of one per keystroke (which otherwise drains one-at-a-time
 * after the user stops). Optimistic cache writes already ran per keystroke, so
 * the on-screen event is unaffected.
 */
export function isSupersededByLaterEditWrite(
  queryClient: QueryClient,
  eventId: string,
  ownVariables: unknown,
): boolean {
  const mutations = listEventMutations(queryClient);
  const self = findOwnMutation(mutations, ownVariables);
  if (!self) return false;
  return mutations.some(
    (mutation) =>
      mutation.state.status === "pending" &&
      mutation.mutationId > self.mutationId &&
      operationOf(mutation) === "replace" &&
      variablesEventId(mutation) === eventId,
  );
}

/**
 * True when another pending event mutation shares this write key. Used to skip
 * per-key snapshot restore on failure so a newer optimistic write for the same
 * event is not clobbered.
 */
export function hasOtherPendingWriteForKey(
  queryClient: QueryClient,
  eventId: string,
  ownVariables: unknown,
): boolean {
  const mutations = listEventMutations(queryClient);
  const self = findOwnMutation(mutations, ownVariables);
  if (!self) return false;
  return mutations.some(
    (mutation) =>
      mutation !== self &&
      mutation.state.status === "pending" &&
      operationOf(mutation) !== undefined &&
      variablesEventId(mutation) === eventId,
  );
}

export type EventWriteResult = { wrote: boolean };

export const skippedEventWrite: EventWriteResult = { wrote: false };
export const completedEventWrite: EventWriteResult = { wrote: true };

export function isSkippedEventWrite(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    "wrote" in data &&
    (data as { wrote: unknown }).wrote === false
  );
}
