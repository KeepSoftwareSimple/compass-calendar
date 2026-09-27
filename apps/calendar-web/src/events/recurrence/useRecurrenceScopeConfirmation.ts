import { useCallback, useState } from "react";
import { RecurringEventUpdateScope } from "@web/common/types/web.event.types";
import { type GridEventDraft } from "@web/events/event-draft.types";
import {
  type ResolveRecurrenceScopeSaveInput,
  resolveRecurrenceScopeDecision,
} from "@web/events/recurrence/recurrence-scope-decision";

export type RecurrenceScopeSaveContext = Omit<
  ResolveRecurrenceScopeSaveInput,
  "action" | "draft"
>;

export type UseRecurrenceScopeConfirmationOptions = {
  getDeleteContext: () => Pick<
    Extract<
      Parameters<typeof resolveRecurrenceScopeDecision>[0],
      { action: "delete" }
    >,
    "isRecurring"
  >;
  getSaveContext: (draft: GridEventDraft) => RecurrenceScopeSaveContext;
  onDelete: (scope: RecurringEventUpdateScope) => void;
  onSave: (draft: GridEventDraft, scope: RecurringEventUpdateScope) => void;
};

export const useRecurrenceScopeConfirmation = ({
  getDeleteContext,
  getSaveContext,
  onDelete,
  onSave,
}: UseRecurrenceScopeConfirmationOptions) => {
  const [standaloneDraft, setStandaloneDraft] = useState<GridEventDraft | null>(
    null,
  );

  const onSubmit = useCallback(
    (draft: GridEventDraft) => {
      const decision = resolveRecurrenceScopeDecision({
        action: "save",
        draft,
        ...getSaveContext(draft),
      });

      switch (decision.kind) {
        case "convertToStandalone":
          setStandaloneDraft(draft);
          return;
        case "apply":
          onSave(draft, decision.scope);
          return;
      }
    },
    [getSaveContext, onSave],
  );

  const onDeleteRequest = useCallback(() => {
    const decision = resolveRecurrenceScopeDecision({
      action: "delete",
      ...getDeleteContext(),
    });

    if (decision.kind === "apply") {
      onDelete(decision.scope);
    }
  }, [getDeleteContext, onDelete]);

  const onConfirmConvertToStandalone = useCallback(() => {
    if (standaloneDraft) {
      onSave(standaloneDraft, RecurringEventUpdateScope.ALL_EVENTS);
    }

    setStandaloneDraft(null);
  }, [onSave, standaloneDraft]);

  const onCancelConvertToStandalone = useCallback(() => {
    setStandaloneDraft(null);
  }, []);

  return {
    onCancelConvertToStandalone,
    onConfirmConvertToStandalone,
    onDelete: onDeleteRequest,
    onSubmit,
    standaloneDraft,
  };
};
