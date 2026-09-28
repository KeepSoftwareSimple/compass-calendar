import { checkoutCompletionGrantsTrial } from "@web/auth/posthog/checkout-grants-trial.util";
import { describe, expect, it } from "bun:test";

describe("checkoutCompletionGrantsTrial", () => {
  it("grants a trial for awaiting_checkout", () => {
    expect(
      checkoutCompletionGrantsTrial({
        subscriptionStatus: "awaiting_checkout",
        trialEndsAt: null,
        isReadOnly: true,
        cancelAtPeriodEnd: false,
        needsPaymentMethod: false,
      }),
    ).toBe(true);
  });

  it("grants a trial for a local trial with enough time left", () => {
    const trialEndsAt = new Date(
      Date.now() + 72 * 60 * 60 * 1000,
    ).toISOString();
    expect(
      checkoutCompletionGrantsTrial({
        subscriptionStatus: "trialing",
        trialEndsAt,
        isReadOnly: false,
        cancelAtPeriodEnd: false,
        needsPaymentMethod: true,
      }),
    ).toBe(true);
  });

  it("does not grant a trial when the local window is inside the Stripe floor", () => {
    const trialEndsAt = new Date(
      Date.now() + 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(
      checkoutCompletionGrantsTrial({
        subscriptionStatus: "trialing",
        trialEndsAt,
        isReadOnly: false,
        cancelAtPeriodEnd: false,
        needsPaymentMethod: true,
      }),
    ).toBe(false);
  });
});
