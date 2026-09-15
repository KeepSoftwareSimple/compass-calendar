import { useEffect } from "react";
import { isEditableKeyboardTarget } from "@web/common/utils/form/form.util";
import {
  isRecurrenceScopeAskReady,
  recurrenceScopeOpportunityActions,
  useRecurrenceScopeOpportunityStore,
} from "@web/events/recurrence/recurrence-scope-opportunity.store";
import { recurrenceScopeForToastDigit } from "@web/events/recurrence/recurrence-scope-toast-digit";
import { isAppLocked } from "@web/shortcuts/app-lock";
import { isEditSequenceArmed } from "@web/shortcuts/useEditSequenceShortcut";

/**
 * Capture-phase digit listener for the recurrence scope toast. Lives under
 * `shortcuts/` so new bindings stay on useAppShortcut or the shortcut engines.
 */
export function useRecurrenceScopeKeydown() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (!isRecurrenceScopeAskReady()) return;
      if (
        event.isComposing ||
        isAppLocked() ||
        isEditableKeyboardTarget(event) ||
        isEditSequenceArmed()
      ) {
        return;
      }

      const scope = recurrenceScopeForToastDigit(event);
      if (!scope) return;

      const current = useRecurrenceScopeOpportunityStore.getState().opportunity;
      if (!current || current.status !== "ready") return;

      event.preventDefault();
      event.stopPropagation();
      recurrenceScopeOpportunityActions.requestPromotion(current.id, scope);
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
