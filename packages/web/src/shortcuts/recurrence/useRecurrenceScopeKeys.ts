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
 * Capture-phase key listeners for the recurrence scope toast: digits promote a
 * ready ask, and releasing Shift settles a deferred one (keyboard nudges hold
 * Shift, so the ask waits for the burst to end). Lives under `shortcuts/` so
 * new bindings stay on useAppShortcut or the shortcut engines.
 */
export function useRecurrenceScopeKeys() {
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

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== "Shift") return;
      recurrenceScopeOpportunityActions.settle();
    };

    // A keyup lost to a focus change (window switch mid-burst) must not strand
    // the ask as pending forever.
    const onBlur = () => recurrenceScopeOpportunityActions.settle();

    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
    };
  }, []);
}
