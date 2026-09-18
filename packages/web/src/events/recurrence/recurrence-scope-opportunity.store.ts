import { create } from "zustand";
import { type Event } from "@core/types/event.contracts";
import { type ReplaceEventInput } from "@core/types/event-command.contracts";
import { type EventRepositorySource } from "@web/events/repositories/event.repository.factory";

export type RecurrenceScopeOpportunity =
  | {
      id: number;
      kind: "replace";
      original: Event;
      input: ReplaceEventInput;
      source: EventRepositorySource;
      status: "pending" | "ready" | "requested" | "submitting";
      requestedScope?: "thisAndFollowing" | "all";
    }
  | {
      id: number;
      kind: "delete";
      original: Event;
      source: EventRepositorySource;
      status: "pending" | "ready" | "requested" | "submitting";
      requestedScope?: "thisAndFollowing" | "all";
    };

type NewRecurrenceScopeOpportunity =
  | Omit<
      Extract<RecurrenceScopeOpportunity, { kind: "replace" }>,
      "id" | "status"
    >
  | Omit<
      Extract<RecurrenceScopeOpportunity, { kind: "delete" }>,
      "id" | "status"
    >;

type RecurrenceScopeOpportunityState = {
  opportunity: RecurrenceScopeOpportunity | null;
  // Occurrence ids whose "Apply to series?" edit ask the user let expire.
  // Session-only: once ignored, that instance is a deliberate one-off and
  // its later edits stop asking. Delete asks never read or write this set.
  declinedEditInstanceIds: Set<string>;
};

let nextOpportunityId = 1;

export const useRecurrenceScopeOpportunityStore =
  create<RecurrenceScopeOpportunityState>()(() => ({
    opportunity: null,
    declinedEditInstanceIds: new Set(),
  }));

const setOpportunity = (opportunity: RecurrenceScopeOpportunity | null) =>
  useRecurrenceScopeOpportunityStore.setState({ opportunity });

// Records an edit ask decline when a live ready replace opportunity ends
// without promotion. Does nothing for delete opportunities or non-ready states.
const recordDeclineIfReadyEdit = (
  current: RecurrenceScopeOpportunity | null,
) => {
  if (!current || current.kind !== "replace" || current.status !== "ready") {
    return;
  }
  useRecurrenceScopeOpportunityStore.setState((state) => ({
    declinedEditInstanceIds: new Set(state.declinedEditInstanceIds).add(
      current.original.id,
    ),
  }));
};

// The live ask when it is an unanswered replace for this same occurrence: the
// user is still editing it, not ignoring its toast.
const liveReplaceFor = (instanceId: string) => {
  const current = useRecurrenceScopeOpportunityStore.getState().opportunity;
  if (current?.kind !== "replace") return null;
  if (current.original.id !== instanceId) return null;
  if (current.status !== "pending" && current.status !== "ready") return null;
  return current;
};

export const recurrenceScopeOpportunityActions = {
  begin: (
    opportunity: NewRecurrenceScopeOpportunity,
    options: { deferred?: boolean } = {},
  ): number => {
    const id = nextOpportunityId++;
    const status = options.deferred ? ("pending" as const) : ("ready" as const);

    // A keyboard nudge burst is one edit: keep the pre-burst `original` so a
    // promotion projects the full delta, and take the newest `input`. No
    // decline: the user has not ignored anything yet.
    if (opportunity.kind === "replace") {
      const live = liveReplaceFor(opportunity.original.id);
      if (live) {
        setOpportunity({ ...live, id, input: opportunity.input, status });
        return id;
      }
    }

    // Superseding a live edit ask ends it without an answer — same decline as
    // letting the toast expire. No onClose fires here (toast.update swaps the
    // handler), so it must be recorded explicitly.
    recordDeclineIfReadyEdit(
      useRecurrenceScopeOpportunityStore.getState().opportunity,
    );
    setOpportunity({ ...opportunity, id, status });
    return id;
  },

  /** Shift released (or focus lost): a deferred ask becomes askable. */
  settle: (): void => {
    useRecurrenceScopeOpportunityStore.setState((state) => {
      if (state.opportunity?.status !== "pending") return state;
      return { opportunity: { ...state.opportunity, status: "ready" } };
    });
  },

  dismiss: (id?: number): void => {
    const current = useRecurrenceScopeOpportunityStore.getState().opportunity;
    if (!current || (id !== undefined && current.id !== id)) return;
    if (current.status !== "ready") return;
    recordDeclineIfReadyEdit(current);
    setOpportunity(null);
  },

  requestPromotion: (id: number, scope: "thisAndFollowing" | "all"): void => {
    useRecurrenceScopeOpportunityStore.setState((state) => {
      const current = state.opportunity;
      if (!current || current.id !== id || current.status !== "ready") {
        return state;
      }
      return {
        opportunity: { ...current, status: "requested", requestedScope: scope },
      };
    });
  },

  claimPromotion: (): RecurrenceScopeOpportunity | null => {
    const current = useRecurrenceScopeOpportunityStore.getState().opportunity;
    if (!current || current.status !== "requested" || !current.requestedScope) {
      return null;
    }
    // Promoting is the opposite of declining: the user chose the series, so
    // drop any stale mark for this instance (a delete ask can promote an
    // instance whose earlier edit ask was ignored).
    useRecurrenceScopeOpportunityStore.setState((state) => {
      if (!state.declinedEditInstanceIds.has(current.original.id)) return state;
      const next = new Set(state.declinedEditInstanceIds);
      next.delete(current.original.id);
      return { declinedEditInstanceIds: next };
    });
    setOpportunity({ ...current, status: "submitting" });
    return current;
  },

  complete: (id: number): void => {
    const current = useRecurrenceScopeOpportunityStore.getState().opportunity;
    if (current?.id === id) setOpportunity(null);
  },

  clear: (): void => setOpportunity(null),

  reset: (): void =>
    useRecurrenceScopeOpportunityStore.setState({
      opportunity: null,
      declinedEditInstanceIds: new Set(),
    }),
};

export const selectRecurrenceScopeOpportunity = (
  state: RecurrenceScopeOpportunityState,
) => state.opportunity;

export const isRecurrenceScopeEditAskDeclined = (instanceId: string): boolean =>
  useRecurrenceScopeOpportunityStore
    .getState()
    .declinedEditInstanceIds.has(instanceId);

/** True while the "Apply to series?" toast is live and 1/2 should promote. */
export const isRecurrenceScopeAskReady = (): boolean =>
  useRecurrenceScopeOpportunityStore.getState().opportunity?.status === "ready";
