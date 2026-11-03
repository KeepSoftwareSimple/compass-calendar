import { queryClient } from "@web/api/query-client";
import {
  isAwaitingCheckoutForTrialStep,
  syncAwaitingCheckoutWriteLockFromServer,
} from "@web/billing/awaiting-checkout-trial-eligible";
import { billingQueryKeys } from "@web/billing/billing.query";
import {
  isAwaitingCheckoutWriteLocked,
  resetBillingWriteLockForTests,
  setBillingWriteLock,
} from "@web/billing/billing-write-lock";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

describe("isAwaitingCheckoutForTrialStep", () => {
  beforeEach(() => {
    resetBillingWriteLockForTests();
    queryClient.removeQueries({ queryKey: billingQueryKeys.status });
  });

  afterEach(() => {
    resetBillingWriteLockForTests();
    queryClient.removeQueries({ queryKey: billingQueryKeys.status });
  });

  it("uses the module write lock when synced", () => {
    setBillingWriteLock({ locked: true, status: "awaiting_checkout" });
    expect(isAwaitingCheckoutForTrialStep()).toBe(true);
  });

  it("reads awaiting_checkout from the billing status cache", () => {
    queryClient.setQueryData(billingQueryKeys.status, {
      subscriptionStatus: "awaiting_checkout",
      trialEndsAt: null,
      isReadOnly: true,
    });
    expect(isAwaitingCheckoutForTrialStep()).toBe(true);
  });

  it("opens after a server billing refusal before status hydrates the lock", () => {
    expect(isAwaitingCheckoutForTrialStep()).toBe(false);
    expect(
      isAwaitingCheckoutForTrialStep({ serverBillingRequired: true }),
    ).toBe(true);
  });

  it("syncAwaitingCheckoutWriteLockFromServer sets awaiting_checkout", () => {
    syncAwaitingCheckoutWriteLockFromServer();
    expect(isAwaitingCheckoutWriteLocked()).toBe(true);
  });
});
