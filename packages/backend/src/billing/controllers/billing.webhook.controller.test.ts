import type Stripe from "stripe";
import { Status } from "@core/errors/status.codes";
import { mockEnv } from "@backend/__tests__/helpers/mock.setup";
import { BillingWebhookController } from "@backend/billing/controllers/billing.webhook.controller";
import * as webhookService from "@backend/billing/services/billing.webhook.service";
import { type StripeBillingGateway } from "@backend/billing/services/stripe.client";
import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";

const stripeConfigured = {
  STRIPE_SECRET_KEY: "rk_test_123",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_PRICE_ID: "price_test",
  STRIPE_PUBLISHABLE_KEY: "pk_test_123",
};

const buildRes = () => {
  const captured: { status: number; payload: unknown } = {
    status: 0,
    payload: undefined,
  };
  const res = {
    status: mock((code: number) => {
      captured.status = code;
      return res;
    }),
    json: mock((value: unknown) => {
      captured.payload = value;
    }),
  };
  return { res, captured };
};

const verifiedEvent = {
  id: "evt_process_1",
  type: "customer.subscription.updated",
} as Stripe.Event;

describe("BillingWebhookController.handleStripe", () => {
  afterEach(() => {
    mock.restore();
  });

  it("returns 400 for a bad signature and does not process the event", async () => {
    using _env = mockEnv(stripeConfigured);
    const constructWebhookEvent = mock(() =>
      Promise.reject(new Error("bad signature")),
    );
    const process = spyOn(webhookService, "processStripeEvent");
    const controller = new BillingWebhookController({
      constructWebhookEvent,
    } as unknown as StripeBillingGateway);

    const req = {
      body: Buffer.from("{}"),
      headers: { "stripe-signature": "bad" },
    } as never;
    const { res, captured } = buildRes();

    await controller.handleStripe(req, res as never);

    expect(captured.status).toBe(Status.BAD_REQUEST);
    expect(captured.payload).toEqual({
      error: "Invalid Stripe webhook signature",
    });
    expect(process).not.toHaveBeenCalled();
  });

  // Processing failures log at `error`, which PostHogExceptionTransport captures.
  it("returns 500 when a verified event fails to process", async () => {
    using _env = mockEnv(stripeConfigured);
    const constructWebhookEvent = mock(() => Promise.resolve(verifiedEvent));
    spyOn(webhookService, "processStripeEvent").mockRejectedValue(
      new Error("mongo down"),
    );
    const controller = new BillingWebhookController({
      constructWebhookEvent,
    } as unknown as StripeBillingGateway);

    const req = {
      body: Buffer.from("{}"),
      headers: { "stripe-signature": "sig" },
    } as never;
    const { res, captured } = buildRes();

    await controller.handleStripe(req, res as never);

    expect(captured.status).toBe(Status.INTERNAL_SERVER);
    expect(captured.payload).toEqual({
      error: "Stripe webhook processing failed",
    });
  });

  it("returns 200 when signature verification and processing succeed", async () => {
    using _env = mockEnv(stripeConfigured);
    const constructWebhookEvent = mock(() => Promise.resolve(verifiedEvent));
    const process = spyOn(
      webhookService,
      "processStripeEvent",
    ).mockResolvedValue(undefined);
    const controller = new BillingWebhookController({
      constructWebhookEvent,
    } as unknown as StripeBillingGateway);

    const req = {
      body: Buffer.from("{}"),
      headers: { "stripe-signature": "sig" },
    } as never;
    const { res, captured } = buildRes();

    await controller.handleStripe(req, res as never);

    expect(captured.status).toBe(Status.OK);
    expect(captured.payload).toEqual({ received: true });
    expect(process).toHaveBeenCalledWith(verifiedEvent, expect.anything());
  });
});
