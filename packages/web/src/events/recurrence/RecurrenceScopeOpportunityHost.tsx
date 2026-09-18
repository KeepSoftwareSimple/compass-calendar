import { useEffect } from "react";
import {
  dismissRecurrenceScopeToastFor,
  showRecurrenceScopePromotionToast,
  showRecurrenceScopeToast,
} from "@web/common/utils/toast/recurrence-scope.toast";
import { useEventMutations } from "@web/events/mutations/useEventMutations";
import {
  recurrenceScopeOpportunityActions,
  selectRecurrenceScopeOpportunity,
  useRecurrenceScopeOpportunityStore,
} from "@web/events/recurrence/recurrence-scope-opportunity.store";
import { useRecurrenceScopeKeys } from "@web/shortcuts/recurrence/useRecurrenceScopeKeys";

export function RecurrenceScopeOpportunityHost() {
  const opportunity = useRecurrenceScopeOpportunityStore(
    selectRecurrenceScopeOpportunity,
  );
  const { promoteRecurring } = useEventMutations();

  useRecurrenceScopeKeys();

  useEffect(() => {
    // A deferred ask (keyboard nudge burst) stays silent until Shift is
    // released. Hide any toast an earlier ready ask left on screen: its buttons
    // are bound to an id the store has already replaced.
    if (opportunity?.status === "pending") {
      dismissRecurrenceScopeToastFor(opportunity);
      return;
    }
    if (opportunity?.status !== "ready") return;
    showRecurrenceScopeToast(opportunity);
  }, [opportunity]);

  useEffect(() => {
    if (opportunity?.status !== "requested") return;
    const claimed = recurrenceScopeOpportunityActions.claimPromotion();
    if (!claimed?.requestedScope) return;
    showRecurrenceScopePromotionToast(claimed);
    promoteRecurring(claimed, claimed.requestedScope);
  }, [opportunity, promoteRecurring]);

  return null;
}
