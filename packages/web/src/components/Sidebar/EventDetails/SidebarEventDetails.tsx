import { useCallback } from "react";
import { useEventById } from "@web/events/queries/useEventById";
import { toRecurrenceScope } from "@web/events/recurrence/recurrence-scope";
import { isExistingEventRecurring } from "@web/events/recurrence/recurrence-scope-decision";
import { useRecurrenceScopeConfirmation } from "@web/events/recurrence/useRecurrenceScopeConfirmation";
import {
  draftActions,
  selectGridDraft,
  selectIsEventFormOpen,
  useDraftStore,
} from "@web/events/stores/draft.store";
import { ConvertToStandaloneDialog } from "@web/views/Forms/EventForm/ConvertToStandaloneDialog";
import { SendInvitationsDialog } from "@web/views/Forms/EventForm/SendInvitationsDialog";
import { EventFormPanel } from "@web/views/Forms/EventFormPanel/EventFormPanel";
import { useCloseEventForm } from "@web/views/Forms/hooks/useCloseEventForm";
import { useDeleteEvent } from "@web/views/Forms/hooks/useDeleteEvent";
import { useDuplicateEvent } from "@web/views/Forms/hooks/useDuplicateEvent";
import { useSaveEventForm } from "@web/views/Forms/hooks/useSaveEventForm";

/**
 * Store-driven event-details panel for Day and Week sidebars. Renders the
 * current grid draft whenever the draft store says the form is open.
 */
export function SidebarEventDetails() {
  const draft = useDraftStore(selectGridDraft);
  const isFormOpen = useDraftStore(selectIsEventFormOpen);
  const _id = draft?.kind === "edit" ? draft.source.id : undefined;
  const {
    saveEventForm: onSave,
    fieldErrors,
    clearFieldErrors,
    invitationPrompt,
  } = useSaveEventForm();
  const onDelete = useDeleteEvent(_id as string);
  const onDuplicate = useDuplicateEvent(_id as string);
  const onClose = useCloseEventForm();
  const existingEvent = useEventById(_id);
  const existing = Boolean(existingEvent);
  const isRecurring = isExistingEventRecurring(existingEvent);
  const seriesBaseEventId =
    draft?.kind === "edit" && draft.source.recurrence.kind === "occurrence"
      ? draft.source.recurrence.seriesId
      : undefined;
  const seriesBaseEvent = useEventById(seriesBaseEventId);

  const getSaveContext = useCallback(
    (editDraft: NonNullable<typeof draft>) => {
      const isEditDraft = editDraft.kind === "edit";
      const draftIsInstance =
        isEditDraft && editDraft.source.recurrence.kind === "occurrence";

      return {
        baseEvent: seriesBaseEvent,
        isInstance: draftIsInstance,
        isRecurring:
          isEditDraft &&
          (isExistingEventRecurring(existingEvent) || draftIsInstance),
      };
    },
    [existingEvent, seriesBaseEvent],
  );

  const getDeleteContext = useCallback(() => ({ isRecurring }), [isRecurring]);

  const confirmation = useRecurrenceScopeConfirmation({
    getDeleteContext,
    getSaveContext,
    onDelete: (applyTo) => onDelete(toRecurrenceScope(applyTo)),
    onSave,
  });

  return (
    <EventFormPanel
      confirmation={{
        onDelete: confirmation.onDelete,
        onSubmit: confirmation.onSubmit,
      }}
      confirmationUi={
        <>
          <ConvertToStandaloneDialog
            draft={confirmation.standaloneDraft}
            onCancel={confirmation.onCancelConvertToStandalone}
            onConfirm={confirmation.onConfirmConvertToStandalone}
          />
          <SendInvitationsDialog prompt={invitationPrompt} />
        </>
      }
      draft={draft}
      fieldErrors={fieldErrors}
      isDraft={!existing}
      isExistingEvent={existing}
      isFormOpen={isFormOpen}
      onClose={onClose}
      onDuplicate={onDuplicate}
      syncDraft={(next) => {
        clearFieldErrors();
        draftActions.setGridDraft(next);
      }}
    />
  );
}
