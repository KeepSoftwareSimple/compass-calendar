import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  Suspense,
  useCallback,
} from "react";
import { type GridEventDraft } from "@web/events/event-draft.types";
import { LazyEventForm as EventForm } from "@web/views/Forms/EventForm/EventForm.lazy";

export type EventFormPanelConfirmation = {
  onDelete: () => void;
  onSubmit: (draft: GridEventDraft) => void | Promise<void>;
};

export type EventFormPanelProps = {
  confirmation: EventFormPanelConfirmation;
  confirmationUi?: ReactNode;
  draft: GridEventDraft | null;
  fieldErrors?: Record<string, string>;
  isDraft: boolean;
  isExistingEvent: boolean;
  isFormOpen: boolean;
  onClose: () => void;
  onDuplicate?: (draft: GridEventDraft) => void;
  syncDraft: (draft: GridEventDraft | null) => void;
};

/**
 * Shared sidebar wiring for Day and Week event forms: resolves functional
 * setDraft updates, guards on open state, and delegates save/delete through
 * the caller's confirmation strategy.
 */
export function EventFormPanel({
  confirmation,
  confirmationUi,
  draft,
  fieldErrors,
  isDraft,
  isExistingEvent,
  isFormOpen,
  onClose,
  onDuplicate,
  syncDraft,
}: EventFormPanelProps) {
  const setDraft: Dispatch<SetStateAction<GridEventDraft | null>> = useCallback(
    (next) => {
      const resolved = typeof next === "function" ? next(draft) : next;
      syncDraft(resolved);
    },
    [draft, syncDraft],
  );

  if (!isFormOpen || !draft) return null;

  return (
    <Suspense fallback={null}>
      <EventForm
        draft={draft}
        fieldErrors={fieldErrors}
        isDraft={isDraft}
        isExistingEvent={isExistingEvent}
        onClose={onClose}
        onDelete={confirmation.onDelete}
        onDuplicate={onDuplicate}
        onSubmit={(nextDraft) => {
          if (nextDraft) void confirmation.onSubmit(nextDraft);
        }}
        setDraft={setDraft}
      />
      {confirmationUi}
    </Suspense>
  );
}
