import { type QueryClient } from "@tanstack/react-query";
import { track } from "@web/auth/posthog/track";
import { startBillingStatusPoll } from "@web/billing/billing.query";
import { checkoutCelebrationActions } from "@web/billing/checkout-celebration.store";
import {
  checkoutPanelActions,
  useCheckoutPanelStore,
} from "@web/billing/checkout-panel.store";

/** Shared Checkout completion: attribute, celebrate, close, and poll status. */
export function completeCheckoutSession(queryClient: QueryClient): void {
  const source = useCheckoutPanelStore.getState().source;
  const attribution = {
    source: source?.kind ?? "gate",
    ...(source?.featureArea ? { feature_area: source.featureArea } : {}),
    ...(source?.actionId ? { action_id: source.actionId } : {}),
  };
  track("trial_converted", attribution);
  if (source?.kind === "shortcut_prompt") {
    track("billing_gate_shortcut_converted", attribution);
  }
  checkoutCelebrationActions.celebrate();
  checkoutPanelActions.close();
  startBillingStatusPoll(queryClient, () => {});
}
