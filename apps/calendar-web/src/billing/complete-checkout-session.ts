import { type QueryClient } from "@tanstack/react-query";
import { type BillingStatusResponse } from "@core/types/billing.types";
import { checkoutCompletionGrantsTrial } from "@web/auth/posthog/checkout-grants-trial.util";
import {
  type SignupMethod,
  trackTrialStepCompleted,
} from "@web/auth/posthog/signup-funnel";
import { track } from "@web/auth/posthog/track";
import { syncPendingLocalEvents } from "@web/auth/providers/connection-revoked.util";
import {
  billingQueryKeys,
  startBillingStatusPoll,
} from "@web/billing/billing.query";
import { checkoutCelebrationActions } from "@web/billing/checkout-celebration.store";
import {
  checkoutPanelActions,
  useCheckoutPanelStore,
} from "@web/billing/checkout-panel.store";
import {
  clearSignupTrialMethod,
  readSignupTrialMethod,
} from "@web/billing/signup-trial.util";
import { eventQueryKeys } from "@web/events/queries/event.query.keys";
import { refreshEventRepositorySource } from "@web/events/repositories/event.repository.source.store";

let checkoutMigrationDone = false;

async function migrateAnonymousEventsAfterCheckout(
  queryClient: QueryClient,
): Promise<void> {
  if (checkoutMigrationDone) return;
  checkoutMigrationDone = true;
  await syncPendingLocalEvents();
  refreshEventRepositorySource(true);
  queryClient.removeQueries({ queryKey: eventQueryKeys.all });
}

function tryMigrateWhenWritable(queryClient: QueryClient): void {
  const status = queryClient.getQueryData<BillingStatusResponse>(
    billingQueryKeys.status,
  );
  if (!status || status.isReadOnly) return;
  void migrateAnonymousEventsAfterCheckout(queryClient);
}

/** Shared Checkout completion: attribute, celebrate, close, poll status, migrate. */
export function completeCheckoutSession(queryClient: QueryClient): void {
  const source = useCheckoutPanelStore.getState().source;
  const attribution = {
    source: source?.kind ?? "gate",
    ...(source?.featureArea ? { feature_area: source.featureArea } : {}),
    ...(source?.actionId ? { action_id: source.actionId } : {}),
  };
  const billingStatus = queryClient.getQueryData<BillingStatusResponse>(
    billingQueryKeys.status,
  );
  track("trial_converted", {
    ...attribution,
    ...(checkoutCompletionGrantsTrial(billingStatus) ? { trial: true } : {}),
  });
  if (source?.kind === "shortcut_prompt") {
    track("billing_gate_shortcut_converted", attribution);
  }
  if (source?.kind === "signup_trial_step") {
    const method: SignupMethod = readSignupTrialMethod();
    trackTrialStepCompleted({ source: "signup_trial_step", method });
    clearSignupTrialMethod();
  }
  checkoutCelebrationActions.celebrate();
  checkoutPanelActions.close();
  const migrateWhenWritable = () => tryMigrateWhenWritable(queryClient);
  migrateWhenWritable();
  startBillingStatusPoll(queryClient, {
    onRefetched: migrateWhenWritable,
    onWindowEnd: migrateWhenWritable,
  });
}

/** Test hook: allow a second migration assertion in the same file. */
export function resetCheckoutMigrationForTests(): void {
  checkoutMigrationDone = false;
}
