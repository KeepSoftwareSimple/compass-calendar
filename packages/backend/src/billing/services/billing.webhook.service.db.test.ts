import { type Request, type Response } from "express";
import Stripe from "stripe";
import { Status } from "@core/errors/status.codes";
import { BaseDriver } from "@backend/__tests__/drivers/base.driver";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import { mockEnv } from "@backend/__tests__/helpers/mock.setup";
import { billingAnalytics } from "@backend/billing/billing.analytics";
import { STRIPE_WEBHOOK_PATH } from "@backend/billing/billing.constants";
import billingWebhookController from "@backend/billing/controllers/billing.webhook.controller";
import { processStripeEvent } from "@backend/billing/services/billing.webhook.service";
import {
  STRIPE_API_VERSION,
  stripeBillingGateway,
} from "@backend/billing/services/stripe.client";
import { stubBillingGateway } from "@backend/billing/services/stripe-billing-gateway.test-helpers";
import mongoService from "@backend/common/services/mongo.service";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from "bun:test";

const stripeConfigured = {
  STRIPE_SECRET_KEY: "rk_test_123",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_PRICE_ID: "price_test",
  STRIPE_PUBLISHABLE_KEY: "pk_test_123",
};

const jsonRes = () => {
  const json = mock();
  const res = {
    status: mock().mockReturnThis(),
    json,
  } as unknown as Response;
  return { res, json };
};

const subscription = (overrides: Partial<Stripe.Subscription> = {}) =>
  ({
    id: "sub_1",
    status: "trialing",
    customer: "cus_1",
    cancel_at_period_end: false,
    trial_start: 1_775_000_000,
    trial_end: 1_775_604_800,
    metadata: { compassUserId: "" },
    items: {
      data: [
        {
          price: { id: "price_test" },
          current_period_end: 1_778_196_800,
        },
      ],
    },
    ...overrides,
  }) as unknown as Stripe.Subscription;

describe("Stripe webhook", () => {
  beforeAll(async () => {
    await setupTestDb(import.meta.url);
  });
  beforeEach(cleanupCollections);
  afterEach(() => {
    mock.restore();
  });
  afterAll(cleanupTestDb);

  it("rejects a non-Buffer body so a parsed JSON payload cannot pass", async () => {
    using _env = mockEnv(stripeConfigured);
    const { res, json } = jsonRes();
    await billingWebhookController.handleStripe(
      { body: { id: "evt_1" }, headers: {} } as unknown as Request,
      res,
    );

    expect((res.status as ReturnType<typeof mock>).mock.calls[0]?.[0]).toBe(
      Status.BAD_REQUEST,
    );
    expect(json).toHaveBeenCalledWith({ error: "Invalid webhook payload" });
  });

  it("returns 400 for a bad signature", async () => {
    using _env = mockEnv(stripeConfigured);
    spyOn(stripeBillingGateway, "constructWebhookEvent").mockImplementation(
      () => {
        throw new Error("No signatures found matching the expected signature");
      },
    );

    const { res, json } = jsonRes();
    await billingWebhookController.handleStripe(
      {
        body: Buffer.from("{}"),
        headers: { "stripe-signature": "bad" },
      } as unknown as Request,
      res,
    );

    expect((res.status as ReturnType<typeof mock>).mock.calls[0]?.[0]).toBe(
      Status.BAD_REQUEST,
    );
    expect((json.mock.calls as unknown[][])[0]?.[0]).toEqual({
      error: "No signatures found matching the expected signature",
    });
  });

  /**
   * The other webhook tests stub the Compass billing gateway, so the SDK's
   * own signature verification never runs. These two use the production
   * `constructWebhookEvent` adapter and stub only the API call, which is the
   * difference between testing our dispatch and testing that Stripe events
   * can get in at all. Under Bun the SDK picks an async-only crypto
   * provider, so a synchronous constructEvent() fails here no matter how
   * valid the signature is.
   */
  const realStripe = () =>
    new Stripe(stripeConfigured.STRIPE_SECRET_KEY, {
      apiVersion: STRIPE_API_VERSION,
    });

  const checkoutPayload = (userId: string) =>
    JSON.stringify({
      id: "evt_signed_1",
      type: "checkout.session.completed",
      created: 1_775_000_100,
      data: {
        object: {
          id: "cs_signed_1",
          client_reference_id: userId,
          customer: "cus_1",
          subscription: "sub_1",
        },
      },
    });

  const seedAwaitingUser = async (email: string) => {
    const userId = mongoService.objectId();
    await mongoService.user.insertOne({
      _id: userId,
      email,
      name: "Signed",
      firstName: "Signed",
      lastName: "User",
      locale: "en",
      billing: { subscriptionStatus: "awaiting_checkout" },
    });
    return userId;
  };

  it("accepts an event carrying a genuine Stripe signature", async () => {
    using _env = mockEnv(stripeConfigured);
    const userId = await seedAwaitingUser("signed@example.com");
    const stripe = realStripe();
    spyOn(stripeBillingGateway, "retrieveSubscription").mockImplementation(
      mock(() =>
        Promise.resolve(
          subscription({ metadata: { compassUserId: userId.toString() } }),
        ),
      ),
    );

    const payload = checkoutPayload(userId.toString());
    const signature = await stripe.webhooks.generateTestHeaderStringAsync({
      payload,
      secret: stripeConfigured.STRIPE_WEBHOOK_SECRET,
    });

    const { res, json } = jsonRes();
    await billingWebhookController.handleStripe(
      {
        body: Buffer.from(payload),
        headers: { "stripe-signature": signature },
      } as unknown as Request,
      res,
    );

    expect((res.status as ReturnType<typeof mock>).mock.calls[0]?.[0]).toBe(
      Status.OK,
    );
    expect(json).toHaveBeenCalledWith({ received: true });
    const stored = await mongoService.user.findOne({ _id: userId });
    expect(stored?.billing?.subscriptionStatus).toBe("trialing");
    expect(stored?.billing?.stripeSubscriptionId).toBe("sub_1");
    expect(await mongoService.billingEvent.countDocuments()).toBe(1);
  });

  it("accepts a signed webhook over HTTP with pretty-printed JSON", async () => {
    using _env = mockEnv(stripeConfigured);
    const userId = await seedAwaitingUser("http-signed@example.com");
    const stripe = realStripe();
    spyOn(stripeBillingGateway, "retrieveSubscription").mockImplementation(
      mock(() =>
        Promise.resolve(
          subscription({ metadata: { compassUserId: userId.toString() } }),
        ),
      ),
    );

    // Pretty-printed so JSON.parse + stringify would change the bytes and
    // fail HMAC. The Express stack must hand the original payload through.
    const payload = JSON.stringify(
      JSON.parse(checkoutPayload(userId.toString())),
      null,
      2,
    );
    const signature = await stripe.webhooks.generateTestHeaderStringAsync({
      payload,
      secret: stripeConfigured.STRIPE_WEBHOOK_SECRET,
    });

    const driver = new BaseDriver();
    try {
      const uri = await driver.listen();
      const response = await fetch(`${uri}${STRIPE_WEBHOOK_PATH}`, {
        method: "POST",
        headers: {
          "stripe-signature": signature,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: payload,
      });

      expect(response.status).toBe(Status.OK);
      expect(await response.json()).toEqual({ received: true });
      const stored = await mongoService.user.findOne({ _id: userId });
      expect(stored?.billing?.subscriptionStatus).toBe("trialing");
      expect(stored?.billing?.stripeSubscriptionId).toBe("sub_1");
    } finally {
      await driver.teardown();
    }
  });

  it("rejects a payload edited after it was signed", async () => {
    using _env = mockEnv(stripeConfigured);
    const userId = await seedAwaitingUser("tampered@example.com");
    const stripe = realStripe();
    spyOn(stripeBillingGateway, "retrieveSubscription").mockImplementation(
      mock(),
    );

    const payload = checkoutPayload(userId.toString());
    const signature = await stripe.webhooks.generateTestHeaderStringAsync({
      payload,
      secret: stripeConfigured.STRIPE_WEBHOOK_SECRET,
    });

    const { res } = jsonRes();
    await billingWebhookController.handleStripe(
      {
        body: Buffer.from(payload.replace("cus_1", "cus_evil")),
        headers: { "stripe-signature": signature },
      } as unknown as Request,
      res,
    );

    expect((res.status as ReturnType<typeof mock>).mock.calls[0]?.[0]).toBe(
      Status.BAD_REQUEST,
    );
    const stored = await mongoService.user.findOne({ _id: userId });
    expect(stored?.billing?.stripeSubscriptionId).toBeUndefined();
    expect(await mongoService.billingEvent.countDocuments()).toBe(0);
  });

  it("links customer and subscription ids from checkout.session.completed", async () => {
    using _env = mockEnv(stripeConfigured);
    const userId = mongoService.objectId();
    await mongoService.user.insertOne({
      _id: userId,
      email: "new@example.com",
      name: "New",
      firstName: "New",
      lastName: "User",
      locale: "en",
      billing: { subscriptionStatus: "awaiting_checkout" },
    });

    const stripe = stubBillingGateway({
      retrieveSubscription: mock(() =>
        Promise.resolve(
          subscription({
            metadata: { compassUserId: userId.toString() },
          }),
        ),
      ),
    });

    await processStripeEvent(
      {
        id: "evt_checkout_1",
        type: "checkout.session.completed",
        created: 1_775_000_100,
        data: {
          object: {
            id: "cs_1",
            client_reference_id: userId.toString(),
            customer: "cus_1",
            subscription: "sub_1",
          },
        },
      } as unknown as Stripe.Event,
      stripe,
    );

    const stored = await mongoService.user.findOne({ _id: userId });
    expect(stored?.billing?.subscriptionStatus).toBe("trialing");
    expect(stored?.billing?.stripeCustomerId).toBe("cus_1");
    expect(stored?.billing?.stripeSubscriptionId).toBe("sub_1");
  });

  it("captures checkout_completed for the user once the subscription is applied", async () => {
    using _env = mockEnv(stripeConfigured);
    const capture = spyOn(billingAnalytics, "capture").mockResolvedValue(true);
    const userId = mongoService.objectId();
    await mongoService.user.insertOne({
      _id: userId,
      email: "captured@example.com",
      name: "Captured",
      firstName: "Captured",
      lastName: "User",
      locale: "en",
      billing: { subscriptionStatus: "awaiting_checkout" },
    });
    const stripe = stubBillingGateway({
      retrieveSubscription: mock(() => Promise.resolve(subscription())),
    });

    await processStripeEvent(
      {
        id: "evt_checkout_captured",
        type: "checkout.session.completed",
        created: 1_775_000_100,
        data: {
          object: {
            id: "cs_captured",
            client_reference_id: userId.toString(),
            customer: "cus_1",
            subscription: "sub_1",
          },
        },
      } as unknown as Stripe.Event,
      stripe,
    );

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith({
      event: "checkout_completed",
      userId: userId.toString(),
      properties: {
        checkout_session_id: "cs_captured",
        subscription_status: "trialing",
        trial: true,
      },
    });
  });

  it("captures checkout_expired by customer id and leaves billing untouched", async () => {
    using _env = mockEnv(stripeConfigured);
    const capture = spyOn(billingAnalytics, "capture").mockResolvedValue(true);
    const userId = mongoService.objectId();
    await mongoService.user.insertOne({
      _id: userId,
      email: "left@example.com",
      name: "Left",
      firstName: "Left",
      lastName: "User",
      locale: "en",
      billing: {
        subscriptionStatus: "awaiting_checkout",
        stripeCustomerId: "cus_left",
      },
    });
    const retrieve = mock(() => Promise.resolve(subscription()));
    const stripe = stubBillingGateway({ retrieveSubscription: retrieve });

    await processStripeEvent(
      {
        id: "evt_checkout_expired",
        type: "checkout.session.expired",
        created: 1_775_000_100,
        data: {
          object: {
            id: "cs_expired",
            mode: "subscription",
            client_reference_id: null,
            customer: "cus_left",
            subscription: null,
          },
        },
      } as unknown as Stripe.Event,
      stripe,
    );

    expect(capture).toHaveBeenCalledWith({
      event: "checkout_expired",
      userId: userId.toString(),
      properties: { checkout_session_id: "cs_expired" },
    });
    expect(retrieve).not.toHaveBeenCalled();
    const stored = await mongoService.user.findOne({ _id: userId });
    expect(stored?.billing).toEqual({
      subscriptionStatus: "awaiting_checkout",
      stripeCustomerId: "cus_left",
    });
  });

  it("acks a duplicate delivery without a second write", async () => {
    using _env = mockEnv(stripeConfigured);
    const userId = mongoService.objectId();
    await mongoService.user.insertOne({
      _id: userId,
      email: "dup@example.com",
      name: "Dup",
      firstName: "Dup",
      lastName: "User",
      locale: "en",
      billing: { subscriptionStatus: "awaiting_checkout" },
    });

    const retrieve = mock(() => Promise.resolve(subscription()));
    const stripe = stubBillingGateway({ retrieveSubscription: retrieve });

    const event = {
      id: "evt_dup_1",
      type: "customer.subscription.updated",
      created: 1_775_000_100,
      data: { object: { id: "sub_1", customer: "cus_1" } },
    } as unknown as Stripe.Event;

    await mongoService.user.updateOne(
      { _id: userId },
      { $set: { "billing.stripeSubscriptionId": "sub_1" } },
    );

    await processStripeEvent(event, stripe);
    await processStripeEvent(event, stripe);

    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(await mongoService.billingEvent.countDocuments()).toBe(1);
  });

  it("ignores a stale event whose created time is older than lastStripeEventAt", async () => {
    using _env = mockEnv(stripeConfigured);
    const userId = mongoService.objectId();
    const newer = new Date("2026-08-12T00:00:00.000Z");
    await mongoService.user.insertOne({
      _id: userId,
      email: "stale@example.com",
      name: "Stale",
      firstName: "Stale",
      lastName: "User",
      locale: "en",
      billing: {
        subscriptionStatus: "active",
        stripeSubscriptionId: "sub_1",
        stripeCustomerId: "cus_1",
        lastStripeEventAt: newer,
      },
    });

    const stripe = stubBillingGateway({
      retrieveSubscription: mock(() =>
        Promise.resolve(subscription({ status: "canceled" })),
      ),
    });

    await processStripeEvent(
      {
        id: "evt_stale_1",
        type: "customer.subscription.updated",
        created: Math.floor(newer.getTime() / 1000) - 90,
        data: { object: { id: "sub_1" } },
      } as unknown as Stripe.Event,
      stripe,
    );

    const stored = await mongoService.user.findOne({ _id: userId });
    expect(stored?.billing?.subscriptionStatus).toBe("active");
  });

  it("applies a same-second event so retrieve() can take a later subscription state", async () => {
    using _env = mockEnv(stripeConfigured);
    const userId = mongoService.objectId();
    const created = new Date("2026-08-12T00:00:00.000Z");
    await mongoService.user.insertOne({
      _id: userId,
      email: "same@example.com",
      name: "Same",
      firstName: "Same",
      lastName: "User",
      locale: "en",
      billing: {
        subscriptionStatus: "active",
        stripeSubscriptionId: "sub_1",
        stripeCustomerId: "cus_1",
        lastStripeEventAt: created,
      },
    });

    const stripe = stubBillingGateway({
      retrieveSubscription: mock(() =>
        Promise.resolve(subscription({ status: "canceled" })),
      ),
    });

    await processStripeEvent(
      {
        id: "evt_same_second_1",
        type: "customer.subscription.deleted",
        created: Math.floor(created.getTime() / 1000),
        data: { object: { id: "sub_1" } },
      } as unknown as Stripe.Event,
      stripe,
    );

    const stored = await mongoService.user.findOne({ _id: userId });
    expect(stored?.billing?.subscriptionStatus).toBe("canceled");
  });
  it("drops the dedupe row when the handler throws so Stripe's retry can reprocess", async () => {
    using _env = mockEnv(stripeConfigured);
    const userId = mongoService.objectId();
    await mongoService.user.insertOne({
      _id: userId,
      email: "throw@example.com",
      name: "Throw",
      firstName: "Throw",
      lastName: "User",
      locale: "en",
      billing: {
        subscriptionStatus: "awaiting_checkout",
        stripeSubscriptionId: "sub_1",
        stripeCustomerId: "cus_1",
      },
    });

    const stripe = stubBillingGateway({
      retrieveSubscription: mock(() =>
        Promise.reject(new Error("stripe unavailable")),
      ),
    });

    const event = {
      id: "evt_throw_1",
      type: "customer.subscription.updated",
      created: 1_775_000_100,
      data: { object: { id: "sub_1" } },
    } as unknown as Stripe.Event;

    await expect(processStripeEvent(event, stripe)).rejects.toThrow(
      "stripe unavailable",
    );

    // The row must be gone, otherwise the dedupe would swallow Stripe's retry
    // and the write would be lost for good.
    expect(
      await mongoService.billingEvent.countDocuments({ _id: event.id }),
    ).toBe(0);

    const stored = await mongoService.user.findOne({ _id: userId });
    expect(stored?.billing?.subscriptionStatus).toBe("awaiting_checkout");

    // A retry after Stripe recovers is reprocessed rather than deduped away.
    const recovered = stubBillingGateway({
      retrieveSubscription: mock(() => Promise.resolve(subscription())),
    });
    await processStripeEvent(event, recovered);

    const retried = await mongoService.user.findOne({ _id: userId });
    expect(retried?.billing?.subscriptionStatus).toBe("trialing");
  });

  it("ignores an unhandled event type without touching the user", async () => {
    using _env = mockEnv(stripeConfigured);
    const userId = mongoService.objectId();
    await mongoService.user.insertOne({
      _id: userId,
      email: "unhandled@example.com",
      name: "Unhandled",
      firstName: "Unhandled",
      lastName: "User",
      locale: "en",
      billing: {
        subscriptionStatus: "active",
        stripeSubscriptionId: "sub_1",
        stripeCustomerId: "cus_1",
      },
    });

    const retrieve = mock(() => Promise.resolve(subscription()));
    const stripe = stubBillingGateway({ retrieveSubscription: retrieve });

    await processStripeEvent(
      {
        id: "evt_invoice_paid_1",
        type: "invoice.paid",
        created: 1_775_000_100,
        data: { object: { id: "in_1", subscription: "sub_1" } },
      } as unknown as Stripe.Event,
      stripe,
    );

    expect(retrieve).not.toHaveBeenCalled();
    const stored = await mongoService.user.findOne({ _id: userId });
    expect(stored?.billing?.subscriptionStatus).toBe("active");
    expect(stored?.billing?.lastStripeEventAt).toBeUndefined();

    // The dedupe row is still written: the insert precedes the handled-type
    // check, so an unhandled redelivery is acked without re-entering handling.
    expect(
      await mongoService.billingEvent.countDocuments({
        _id: "evt_invoice_paid_1",
      }),
    ).toBe(1);
  });

  describe("setup-mode checkout.session.completed", () => {
    const seedCustomer = async (billing: Record<string, unknown> = {}) => {
      const userId = mongoService.objectId();
      await mongoService.user.insertOne({
        _id: userId,
        email: "setup@example.com",
        name: "Setup User",
        firstName: "Setup",
        lastName: "User",
        locale: "en",
        billing: {
          subscriptionStatus: "active",
          stripeCustomerId: "cus_setup",
          ...billing,
        },
      });
      return userId;
    };

    const setupEvent = (userId: string, eventId = "evt_setup_1") =>
      ({
        id: eventId,
        type: "checkout.session.completed",
        created: 1_775_000_100,
        data: {
          object: {
            id: "cs_setup_1",
            mode: "setup",
            client_reference_id: userId,
            customer: "cus_setup",
          },
        },
      }) as unknown as Stripe.Event;

    const retrievedSetupSession = (userId: string) => ({
      id: "cs_setup_1",
      mode: "setup",
      client_reference_id: userId,
      customer: "cus_setup",
      setup_intent: {
        id: "seti_1",
        payment_method: "pm_new",
      },
    });

    it("sets the customer and subscription default payment method", async () => {
      using _env = mockEnv(stripeConfigured);
      const userId = await seedCustomer({
        stripeSubscriptionId: "sub_setup",
      });
      const customersUpdate = mock(() => Promise.resolve({ id: "cus_setup" }));
      const subscriptionsUpdate = mock(() =>
        Promise.resolve(
          subscription({
            id: "sub_setup",
            status: "active",
            customer: "cus_setup",
            default_payment_method: "pm_new",
          }),
        ),
      );
      const sessionsRetrieve = mock(() =>
        Promise.resolve(retrievedSetupSession(userId.toString())),
      );
      const stripe = stubBillingGateway({
        retrieveCheckoutSession: sessionsRetrieve,
        updateCustomer: customersUpdate,
        updateSubscription: subscriptionsUpdate,
      });

      await processStripeEvent(setupEvent(userId.toString()), stripe);

      expect((sessionsRetrieve.mock.calls as unknown[][])[0]?.[0]).toBe("cs_setup_1");
      expect((sessionsRetrieve.mock.calls as unknown[][])[0]?.[1]).toEqual({
        expand: ["setup_intent"],
      });
      expect((customersUpdate.mock.calls as unknown[][])[0]).toEqual([
        "cus_setup",
        { invoice_settings: { default_payment_method: "pm_new" } },
      ]);
      expect((subscriptionsUpdate.mock.calls as unknown[][])[0]).toEqual([
        "sub_setup",
        { default_payment_method: "pm_new" },
      ]);
      const stored = await mongoService.user.findOne({ _id: userId });
      expect(stored?.billing?.subscriptionStatus).toBe("active");
      expect(stored?.billing?.stripeSubscriptionId).toBe("sub_setup");
    });

    it("updates only the customer when there is no subscription id", async () => {
      using _env = mockEnv(stripeConfigured);
      const userId = await seedCustomer();
      const customersUpdate = mock(() => Promise.resolve({ id: "cus_setup" }));
      const subscriptionsUpdate = mock();
      const stripe = stubBillingGateway({
        retrieveCheckoutSession: mock(() =>
          Promise.resolve(retrievedSetupSession(userId.toString())),
        ),
        updateCustomer: customersUpdate,
        updateSubscription: subscriptionsUpdate,
      });

      await processStripeEvent(
        setupEvent(userId.toString(), "evt_setup_2"),
        stripe,
      );

      expect(customersUpdate).toHaveBeenCalled();
      expect(subscriptionsUpdate).not.toHaveBeenCalled();
    });

    it("still applies a subscription-mode checkout along the existing path", async () => {
      using _env = mockEnv(stripeConfigured);
      const userId = mongoService.objectId();
      await mongoService.user.insertOne({
        _id: userId,
        email: "submode@example.com",
        name: "Sub",
        firstName: "Sub",
        lastName: "User",
        locale: "en",
        billing: { subscriptionStatus: "awaiting_checkout" },
      });
      const sessionsRetrieve = mock();
      const retrieve = mock(() =>
        Promise.resolve(
          subscription({ metadata: { compassUserId: userId.toString() } }),
        ),
      );
      const stripe = stubBillingGateway({
        retrieveCheckoutSession: sessionsRetrieve,
        retrieveSubscription: retrieve,
      });

      await processStripeEvent(
        {
          id: "evt_sub_mode_1",
          type: "checkout.session.completed",
          created: 1_775_000_100,
          data: {
            object: {
              id: "cs_sub_1",
              mode: "subscription",
              client_reference_id: userId.toString(),
              customer: "cus_1",
              subscription: "sub_1",
            },
          },
        } as unknown as Stripe.Event,
        stripe,
      );

      expect(sessionsRetrieve).not.toHaveBeenCalled();
      expect(retrieve).toHaveBeenCalled();
      const stored = await mongoService.user.findOne({ _id: userId });
      expect(stored?.billing?.subscriptionStatus).toBe("trialing");
    });

    it("leaves no billingEvent row when Stripe fails, so the retry reprocesses", async () => {
      using _env = mockEnv(stripeConfigured);
      const userId = await seedCustomer({ stripeSubscriptionId: "sub_setup" });
      const stripe = stubBillingGateway({
        retrieveCheckoutSession: mock(() =>
          Promise.reject(new Error("stripe unavailable")),
        ),
      });

      const event = setupEvent(userId.toString(), "evt_setup_fail");
      await expect(processStripeEvent(event, stripe)).rejects.toThrow(
        "stripe unavailable",
      );
      expect(
        await mongoService.billingEvent.countDocuments({ _id: event.id }),
      ).toBe(0);
    });

    it("accepts a signed setup-mode event", async () => {
      using _env = mockEnv(stripeConfigured);
      const userId = await seedCustomer({ stripeSubscriptionId: "sub_setup" });
      const stripe = realStripe();
      const customersUpdate = mock(() => Promise.resolve({ id: "cus_setup" }));
      const subscriptionsUpdate = mock(() =>
        Promise.resolve(
          subscription({
            id: "sub_setup",
            status: "active",
            customer: "cus_setup",
          }),
        ),
      );
      spyOn(stripeBillingGateway, "retrieveCheckoutSession").mockImplementation(
        mock(() => Promise.resolve(retrievedSetupSession(userId.toString()))),
      );
      spyOn(stripeBillingGateway, "updateCustomer").mockImplementation(
        customersUpdate,
      );
      spyOn(stripeBillingGateway, "updateSubscription").mockImplementation(
        subscriptionsUpdate,
      );

      const payload = JSON.stringify({
        id: "evt_setup_signed",
        type: "checkout.session.completed",
        created: 1_775_000_100,
        data: {
          object: {
            id: "cs_setup_1",
            mode: "setup",
            client_reference_id: userId.toString(),
            customer: "cus_setup",
          },
        },
      });
      const signature = await stripe.webhooks.generateTestHeaderStringAsync({
        payload,
        secret: stripeConfigured.STRIPE_WEBHOOK_SECRET,
      });

      const { res, json } = jsonRes();
      await billingWebhookController.handleStripe(
        {
          body: Buffer.from(payload),
          headers: { "stripe-signature": signature },
        } as unknown as Request,
        res,
      );

      expect((res.status as ReturnType<typeof mock>).mock.calls[0]?.[0]).toBe(
        Status.OK,
      );
      expect(json).toHaveBeenCalledWith({ received: true });
      expect(customersUpdate).toHaveBeenCalled();
      expect(subscriptionsUpdate).toHaveBeenCalled();
    });
  });
});
