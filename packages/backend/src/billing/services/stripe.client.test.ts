import Stripe from "stripe";
import { mockEnv } from "@backend/__tests__/helpers/mock.setup";
import { stripeBillingGateway } from "@backend/billing/services/stripe.client";
import { describe, expect, it, spyOn } from "bun:test";

describe("stripeBillingGateway.deleteCustomer", () => {
  it("passes the idempotency key as request options, not as body params", async () => {
    using _env = mockEnv({
      STRIPE_SECRET_KEY: "rk_test_123",
      STRIPE_WEBHOOK_SECRET: "whsec_test",
      STRIPE_PRICE_ID: "price_test",
      STRIPE_PUBLISHABLE_KEY: "pk_test_123",
    });
    const del = spyOn(
      Stripe.resources.Customers.prototype,
      "del",
    ).mockResolvedValue({ id: "cus_1", deleted: true } as never);

    try {
      await stripeBillingGateway.deleteCustomer("cus_1", {
        idempotencyKey: "compass-account-delete-u1",
      });

      expect(del).toHaveBeenCalledWith(
        "cus_1",
        {},
        { idempotencyKey: "compass-account-delete-u1" },
      );
    } finally {
      del.mockRestore();
    }
  });
});
