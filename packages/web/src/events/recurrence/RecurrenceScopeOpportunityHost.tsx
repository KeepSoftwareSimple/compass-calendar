import { useEffect } from "react";
import {
  showRecurrenceScopePromotionToast,
  showRecurrenceScopeToast,
} from "@web/common/utils/toast/recurrence-scope.toast";
import { useEventMutations } from "@web/events/mutations/useEventMutations";
import {
  recurrenceScopeOpportunityActions,
  selectRecurrenceScopeOpportunity,
  useRecurrenceScopeOpportunityStore,
} from "@web/events/recurrence/recurrence-scope-opportunity.store";
import { useRecurrenceScopeKeydown } from "@web/shortcuts/recurrence/useRecurrenceScopeKeydown";

export function RecurrenceScopeOpportunityHost() {
  const opportunity = useRecurrenceScopeOpportunityStore(
    selectRecurrenceScopeOpportunity,
  );
  const { promoteRecurring } = useEventMutations();

  useRecurrenceScopeKeydown();

  useEffect(() => {
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
