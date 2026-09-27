import { useMutationState } from "@tanstack/react-query";
import { eventMutationKeys } from "./event.mutation.keys";

// True while any event mutation is in flight. Selects only the mutation id so
// the subscription's equality check stays a cheap integer compare instead of a
// deep compare of each mutation's variables.
export function useHasPendingEventMutations() {
  return (
    useMutationState({
      filters: { mutationKey: eventMutationKeys.all, status: "pending" },
      select: (mutation) => mutation.mutationId,
    }).length > 0
  );
}
