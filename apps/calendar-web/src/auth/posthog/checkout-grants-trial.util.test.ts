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
      }),
    ).toBe(true);
  });

  it("does not grant a trial for trialing", () => {
    expect(
      checkoutCompletionGrantsTrial({
        subscriptionStatus: "trialing",
        trialEndsAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
        isReadOnly: false,
        cancelAtPeriodEnd: false,
      }),
    ).toBe(false);
  });
});
