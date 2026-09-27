import { useCallback } from "react";
import { type CompassEvent } from "@core/types/compass-event.contracts";
import { type EventId } from "@core/types/domain-primitives";
import { type RecurrenceScope } from "@core/types/event-command.contracts";
import { useEventMutations } from "@web/events/mutations/useEventMutations";
import { useEventById } from "@web/events/queries/useEventById";
import { draftActions } from "@web/events/stores/draft.store";

// No confirmation prompt: deletes are undoable via Cmd/Ctrl+Z (the mutation
// layer records a snapshot and shows a "Deleted" toast with the undo hint).
export function deleteEventAndDiscardDraft(
  deleteEvent?: (payload: { id: EventId; scope: RecurrenceScope }) => void,
  existingEvent?: CompassEvent | null,
) {
  if (existingEvent?._id) {
    deleteEvent?.({
      id: existingEvent._id as EventId,
      scope: "this",
    });
  }

  draftActions.discard();
}

/**
 * useDeleteEvent
 *
 * **important** use within Day View for now
 */
export function useDeleteEvent(_id: string) {
  const existingEvent = useEventById(_id);
  const { delete: deleteEventMutation } = useEventMutations();

  const deleteEvent = useCallback(
    (scope: RecurrenceScope = "this") => {
      if (!existingEvent?.id) return;
      deleteEventMutation({ id: existingEvent.id, scope });
      draftActions.discard();
    },
    [deleteEventMutation, existingEvent],
  );

  return deleteEvent;
}
