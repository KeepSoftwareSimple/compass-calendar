import type Stripe from "stripe";
import { createStripeBillingGateway } from "@backend/billing/services/stripe.client";
import { describe, expect, it, mock } from "bun:test";

describe("stripeBillingGateway.deleteCustomer", () => {
  it("passes the idempotency key as a request option, not a body param", async () => {
    const del = mock(async () => ({ id: "cus_1", deleted: true }));
    const gateway = createStripeBillingGateway(
      () => ({ customers: { del } }) as unknown as Stripe,
    );

    await gateway.deleteCustomer("cus_1", {
      idempotencyKey: "compass-account-delete-u1",
    });

    // stripe-node's del is (id, params, options). An options object in the
    // params slot goes out as ?idempotencyKey=… and Stripe rejects the call.
    expect(del).toHaveBeenCalledWith(
      "cus_1",
      {},
      { idempotencyKey: "compass-account-delete-u1" },
    );
  });
});
