import { queryClient } from "@web/api/query-client";
import {
  appConfigQueryOptions,
  billingStatusQueryOptions,
  isBillingEnforced,
} from "@web/billing/billing.query";

/**
 * Anonymous event migration runs only when the account can write. Self-host and
 * paused enforcement keep the legacy post-auth sync; read-only billing waits
 * until Checkout completes.
 */
export async function resolveShouldSyncPendingLocalEvents(): Promise<boolean> {
  const config = await queryClient.ensureQueryData(appConfigQueryOptions());
  if (!config.billing.isConfigured || !isBillingEnforced(config)) {
    return true;
  }
  const status = await queryClient.fetchQuery(billingStatusQueryOptions());
  return !status.isReadOnly;
}
