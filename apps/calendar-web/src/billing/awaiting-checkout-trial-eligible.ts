import { type BillingStatusResponse } from "@core/types/billing.types";
import { queryClient } from "@web/api/query-client";
import { billingQueryKeys } from "@web/billing/billing.query";
import {
  getBillingWriteLockStatus,
  isAwaitingCheckoutWriteLocked,
  isBillingWriteLocked,
  setBillingWriteLock,
} from "@web/billing/billing-write-lock";

function readCachedBillingStatus(): BillingStatusResponse | undefined {
  return queryClient.getQueryData(billingQueryKeys.status);
}

/**
 * True when the in-modal trial step should open for explore-first
 * `awaiting_checkout`. Uses the module write lock when synced, falls back to
 * the billing status query cache, and accepts a server `BILLING_REQUIRED`
 * refusal so a fast first write after signup is not dropped while status loads.
 */
export function isAwaitingCheckoutForTrialStep(options?: {
  serverBillingRequired?: boolean;
}): boolean {
  if (isAwaitingCheckoutWriteLocked()) return true;

  const cached = readCachedBillingStatus();
  if (cached?.subscriptionStatus === "awaiting_checkout" && cached.isReadOnly) {
    return true;
  }

  return options?.serverBillingRequired === true;
}

/** Align the module write lock with a server-side billing refusal. */
export function syncAwaitingCheckoutWriteLockFromServer(): void {
  if (
    isBillingWriteLocked() &&
    getBillingWriteLockStatus() === "awaiting_checkout"
  ) {
    return;
  }
  setBillingWriteLock({ locked: true, status: "awaiting_checkout" });
}
