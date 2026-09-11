import Stripe from "stripe";
import { type Schema_UserBilling } from "@core/types/user.types";
import {
  cleanupCollections,
  cleanupTestDb,
  setupTestDb,
} from "@backend/__tests__/helpers/mock.db.setup";
import { mockEnv } from "@backend/__tests__/helpers/mock.setup";
import { StripeService } from "@backend/billing/services/stripe.service";
import { stubBillingGateway } from "@backend/billing/services/stripe-billing-gateway.test-helpers";
import mongoService from "@backend/common/services/mongo.service";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
} from "bun:test";

const stripeConfigured = {
  STRIPE_SECRET_KEY: "rk_test_123",
  STRIPE_WEBHOOK_SECRET: "whsec_test",
  STRIPE_PRICE_ID: "price_test",
  STRIPE_PUBLISHABLE_KEY: "pk_test_123",
  FRONTEND_URL: "http://localhost:9080",
} as const;

describe("StripeService", () => {
  beforeAll(async () => {
    await setupTestDb(import.meta.url);
  });
  beforeEach(cleanupCollections);
  afterAll(cleanupTestDb);

  it("creates a Checkout session in subscription mode with a trial", async () => {
    using _env = mockEnv(stripeConfigured);
    const userId = mongoService.objectId();
    await mongoService.user.insertOne({
      _id: userId,
      email: "pay@example.com",
      name: "Pay User",
      firstName: "Pay",
      lastName: "User",
      locale: "en",
    });

    const customersCreate = mock(() => Promise.resolve({ id: "cus_1" }));
    const sessionsCreate = mock(() =>
      Promise.resolve({ client_secret: "cs_test_1" }),
    );

    const stripeService = new StripeService(
      stubBillingGateway({
        createCustomer: customersCreate,
        createCheckoutSession: sessionsCreate,
      }),
    );

    const result = await stripeService.createCheckoutSession(userId.toString());

    expect(result.clientSecret).toBe("cs_test_1");
    expect(customersCreate).toHaveBeenCalled();
    const sessionArgs = (sessionsCreate.mock.calls as unknown[][])[0]?.[0] as {
      mode: string;
      client_reference_id: string;
      subscription_data: { trial_period_days: number };
      line_items: Array<{ price: string; quantity: number }>;
      ui_mode?: string;
      redirect_on_completion?: string;
      success_url?: string;
      cancel_url?: string;
    };
    expect(sessionArgs.mode).toBe("subscription");
    expect(sessionArgs.client_reference_id).toBe(userId.toString());
    expect(sessionArgs.subscription_data.trial_period_days).toBe(7);
    expect(sessionArgs.line_items[0]?.price).toBe("price_test");
    expect(
      (sessionArgs as { payment_method_collection?: string })
        .payment_method_collection,
    ).toBe("always");
    expect(
      (sessionArgs as { payment_method_types?: unknown }).payment_method_types,
    ).toBeUndefined();
    // Stripe Tax needs all three together with an existing customer: drop
    // one and tax silently calculates as zero instead of erroring.
    expect(
      sessionArgs as {
        automatic_tax?: unknown;
        customer_update?: unknown;
        billing_address_collection?: unknown;
      },
    ).toMatchObject({
      automatic_tax: { enabled: true },
      customer_update: { address: "auto" },
      billing_address_collection: "required",
    });
    expect(sessionArgs.ui_mode).toBe("embedded");
    expect(sessionArgs.redirect_on_completion).toBe("never");
    expect(sessionArgs.success_url).toBeUndefined();
    expect(sessionArgs.cancel_url).toBeUndefined();
    expect((sessionsCreate.mock.calls as unknown[][])[0]?.[1]).toEqual({
      idempotencyKey: `compass-checkout-v3-${userId.toString()}`,
    });

    const stored = await mongoService.user.findOne({ _id: userId });
    expect(stored?.billing?.stripeCustomerId).toBe("cus_1");
    expect(stored?.billing?.subscriptionStatus).toBe("awaiting_checkout");
  });

  it("reuses an existing Stripe customer id", async () => {
    using _env = mockEnv(stripeConfigured);
    const userId = mongoService.objectId();
    await mongoService.user.insertOne({
      _id: userId,
      email: "pay@example.com",
      name: "Pay User",
      firstName: "Pay",
      lastName: "User",
      locale: "en",
      billing: {
        subscriptionStatus: "awaiting_checkout",
        stripeCustomerId: "cus_existing",
      },
    });

    const customersCreate = mock(() => Promise.resolve({ id: "cus_new" }));
    const sessionsCreate = mock(() =>
      Promise.resolve({ client_secret: "cs_test_2" }),
    );
    const stripeService = new StripeService(
      stubBillingGateway({
        createCustomer: customersCreate,
        createCheckoutSession: sessionsCreate,
      }),
    );

    await stripeService.createCheckoutSession(userId.toString());

    expect(customersCreate).not.toHaveBeenCalled();
    const sessionArgs = (sessionsCreate.mock.calls as unknown[][])[0]?.[0] as {
      customer: string;
    };
    expect(sessionArgs.customer).toBe("cus_existing");
  });

  it("deletes the Stripe customer before an account is removed", async () => {
    using _env = mockEnv(stripeConfigured);
    const userId = mongoService.objectId();
    await mongoService.user.insertOne({
      _id: userId,
      email: "delete@example.com",
      name: "Delete User",
      firstName: "Delete",
      lastName: "User",
      locale: "en",
      billing: {
        subscriptionStatus: "active",
        stripeCustomerId: "cus_delete",
      },
    });
    const del = mock(() =>
      Promise.resolve({ id: "cus_delete", deleted: true }),
    );
    const stripeService = new StripeService(
      stubBillingGateway({
        deleteCustomer: del,
      }),
    );

    await stripeService.deleteCustomerForAccount(userId.toString());

    expect(del).toHaveBeenCalledWith("cus_delete", {
      idempotencyKey: `compass-account-delete-${userId.toString()}`,
    });
  });

  it("allows an idempotent account-deletion retry after Stripe removed the customer", async () => {
    using _env = mockEnv(stripeConfigured);
    const userId = mongoService.objectId();
    await mongoService.user.insertOne({
      _id: userId,
      email: "already-deleted@example.com",
      name: "Deleted User",
      firstName: "Deleted",
      lastName: "User",
      locale: "en",
      billing: {
        subscriptionStatus: "canceled",
        stripeCustomerId: "cus_deleted",
      },
    });
    const missing = new Stripe.errors.StripeInvalidRequestError({
      message: "No such customer",
      type: "invalid_request_error",
      statusCode: 404,
    });
    const stripeService = new StripeService(
      stubBillingGateway({
        deleteCustomer: mock(() => Promise.reject(missing)),
      }),
    );

    await expect(
      stripeService.deleteCustomerForAccount(userId.toString()),
    ).resolves.toBeUndefined();
  });

  it("creates a Checkout session without a trial when awaiting_checkout still has a stale subscription id", async () => {
    using _env = mockEnv(stripeConfigured);
    const userId = mongoService.objectId();
    await mongoService.user.insertOne({
      _id: userId,
      email: "incomplete@example.com",
      name: "Incomplete User",
      firstName: "Incomplete",
      lastName: "User",
      locale: "en",
      billing: {
        subscriptionStatus: "awaiting_checkout",
        stripeCustomerId: "cus_incomplete",
        stripeSubscriptionId: "sub_incomplete",
      },
    });

    const sessionsCreate = mock(() =>
      Promise.resolve({ client_secret: "cs_test_stale" }),
    );
    const stripeService = new StripeService(
      stubBillingGateway({
        createCheckoutSession: sessionsCreate,
      }),
    );

    const result = await stripeService.createCheckoutSession(userId.toString());

    expect(result.clientSecret).toBe("cs_test_stale");
    const sessionArgs = (sessionsCreate.mock.calls as unknown[][])[0]?.[0] as {
      subscription_data: { trial_period_days?: number };
    };
    expect(sessionArgs.subscription_data.trial_period_days).toBeUndefined();
  });

  it("omits trial_period_days when the user already had a Stripe subscription", async () => {
    using _env = mockEnv(stripeConfigured);
    const userId = mongoService.objectId();
    await mongoService.user.insertOne({
      _id: userId,
      email: "expired@example.com",
      name: "Expired User",
      firstName: "Expired",
      lastName: "User",
      locale: "en",
      billing: {
        subscriptionStatus: "expired",
        stripeCustomerId: "cus_expired",
        stripeSubscriptionId: "sub_old",
      },
    });

    const sessionsCreate = mock(() =>
      Promise.resolve({ client_secret: "cs_test_3" }),
    );
    const stripeService = new StripeService(
      stubBillingGateway({
        createCustomer: mock(),
        createCheckoutSession: sessionsCreate,
      }),
    );

    await stripeService.createCheckoutSession(userId.toString());

    const sessionArgs = (sessionsCreate.mock.calls as unknown[][])[0]?.[0] as {
      subscription_data: { trial_period_days?: number };
    };
    expect(sessionArgs.subscription_data.trial_period_days).toBeUndefined();
  });

  it("rejects a live subscriber with 409 instead of a second Checkout", async () => {
    using _env = mockEnv(stripeConfigured);
    const sessionsCreate = mock(() =>
      Promise.resolve({ client_secret: "cs_should_not_create" }),
    );
    const stripeService = new StripeService(
      stubBillingGateway({
        createCheckoutSession: sessionsCreate,
      }),
    );

    for (const status of ["trialing", "active", "past_due"] as const) {
      const userId = mongoService.objectId();
      await mongoService.user.insertOne({
        _id: userId,
        email: `${status}@example.com`,
        name: "Live User",
        firstName: "Live",
        lastName: "User",
        locale: "en",
        billing: {
          subscriptionStatus: status,
          stripeCustomerId: `cus_${status}`,
          stripeSubscriptionId: `sub_${status}`,
        },
      });

      await expect(
        stripeService.createCheckoutSession(userId.toString()),
      ).rejects.toMatchObject({
        name: "BillingHttpError",
        status: 409,
        clientMessage:
          "You already have a subscription. Manage it under Settings > Billing.",
      });
    }

    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("maps a Stripe invalid-request error to BillingHttpError", async () => {
    using _env = mockEnv(stripeConfigured);
    const userId = mongoService.objectId();
    await mongoService.user.insertOne({
      _id: userId,
      email: "pay@example.com",
      name: "Pay User",
      firstName: "Pay",
      lastName: "User",
      locale: "en",
    });

    const stripeError = new Stripe.errors.StripeInvalidRequestError({
      message: "No such price: 'price_test'",
      type: "invalid_request_error",
      statusCode: 400,
    });
    const stripeService = new StripeService(
      stubBillingGateway({
        createCustomer: mock(() => Promise.resolve({ id: "cus_1" })),
        createCheckoutSession: mock(() => Promise.reject(stripeError)),
      }),
    );

    await expect(
      stripeService.createCheckoutSession(userId.toString()),
    ).rejects.toMatchObject({
      name: "BillingHttpError",
      status: 400,
      clientMessage: "Couldn't start billing. Please try again in a moment.",
    });
  });
  describe("endTrialNow", () => {
    const seedTrialingUser = async (billing: Record<string, unknown> = {}) => {
      const userId = mongoService.objectId();
      await mongoService.user.insertOne({
        _id: userId,
        email: "trial@example.com",
        name: "Trial User",
        firstName: "Trial",
        lastName: "User",
        locale: "en",
        billing: {
          subscriptionStatus: "trialing",
          stripeCustomerId: "cus_trial",
          stripeSubscriptionId: "sub_trial",
          ...billing,
        },
      });
      return userId;
    };

    const stripeSubscription = (
      status: string,
      overrides: Record<string, unknown> = {},
    ) =>
      ({
        id: "sub_trial",
        status,
        customer: "cus_trial",
        cancel_at_period_end: false,
        trial_start: 1_756_000_000,
        trial_end: 1_756_200_000,
        items: {
          data: [
            {
              price: { id: "price_test" },
              current_period_end: 1_758_800_000,
            },
          ],
        },
        ...overrides,
      }) as unknown as Stripe.Subscription;

    it("ends the trial now and reports the resulting active status", async () => {
      using _env = mockEnv(stripeConfigured);
      const userId = await seedTrialingUser();

      const update = mock(() => Promise.resolve(stripeSubscription("active")));
      const stripeService = new StripeService(
        stubBillingGateway({
          updateSubscription: update,
        }),
      );

      const result = await stripeService.endTrialNow(userId.toString());

      expect(result).toEqual({
        subscriptionStatus: "active",
        trialEndsAt: new Date(1_756_200_000 * 1000).toISOString(),
        isReadOnly: false,
        cancelAtPeriodEnd: false,
      });
      expect((update.mock.calls as unknown[][])[0]?.[0]).toBe("sub_trial");
      expect((update.mock.calls as unknown[][])[0]?.[1]).toEqual({
        trial_end: "now",
        proration_behavior: "none",
        cancel_at_period_end: false,
      });
      expect((update.mock.calls as unknown[][])[0]?.[2]).toEqual({
        idempotencyKey: "compass-end-trial-v2-sub_trial",
      });

      const stored = await mongoService.user.findOne({ _id: userId });
      expect(stored?.billing?.subscriptionStatus).toBe("active");
      expect(stored?.billing?.stripePriceId).toBe("price_test");
    });

    it("reports past_due, still writable, when the charge fails", async () => {
      using _env = mockEnv(stripeConfigured);
      const userId = await seedTrialingUser();

      const stripeService = new StripeService(
        stubBillingGateway({
          updateSubscription: mock(() =>
            Promise.resolve(stripeSubscription("past_due")),
          ),
        }),
      );

      const result = await stripeService.endTrialNow(userId.toString());

      expect(result.subscriptionStatus).toBe("past_due");
      expect(result.isReadOnly).toBe(false);
    });

    it("clears a scheduled cancel while charging the trial", async () => {
      using _env = mockEnv(stripeConfigured);
      const userId = await seedTrialingUser({ cancelAtPeriodEnd: true });

      const update = mock(() => Promise.resolve(stripeSubscription("active")));
      const stripeService = new StripeService(
        stubBillingGateway({
          updateSubscription: update,
        }),
      );

      const result = await stripeService.endTrialNow(userId.toString());

      expect(result.subscriptionStatus).toBe("active");
      expect(result.cancelAtPeriodEnd).toBe(false);
      expect((update.mock.calls as unknown[][])[0]?.[1]).toMatchObject({
        cancel_at_period_end: false,
      });
      const stored = await mongoService.user.findOne({ _id: userId });
      expect(stored?.billing?.cancelAtPeriodEnd).toBe(false);
    });

    it("rejects with 409 when the account is not trialing", async () => {
      using _env = mockEnv(stripeConfigured);
      const userId = await seedTrialingUser({ subscriptionStatus: "active" });

      const update = mock(() => Promise.resolve(stripeSubscription("active")));
      const stripeService = new StripeService(
        stubBillingGateway({
          updateSubscription: update,
        }),
      );

      await expect(
        stripeService.endTrialNow(userId.toString()),
      ).rejects.toMatchObject({
        name: "BillingHttpError",
        status: 409,
        clientMessage: "No active trial to end.",
      });
      expect(update).not.toHaveBeenCalled();
    });

    it("rejects with 409 when there is no Stripe subscription to end", async () => {
      using _env = mockEnv(stripeConfigured);
      const userId = await seedTrialingUser({
        stripeSubscriptionId: undefined,
      });
      const stripeService = new StripeService(stubBillingGateway({}));

      await expect(
        stripeService.endTrialNow(userId.toString()),
      ).rejects.toMatchObject({ status: 409 });
    });

    it("maps a Stripe failure to BillingHttpError", async () => {
      using _env = mockEnv(stripeConfigured);
      const userId = await seedTrialingUser();

      const stripeError = new Stripe.errors.StripeInvalidRequestError({
        message: "No such subscription",
        type: "invalid_request_error",
        statusCode: 400,
      });
      const stripeService = new StripeService(
        stubBillingGateway({
          updateSubscription: mock(() => Promise.reject(stripeError)),
        }),
      );

      await expect(
        stripeService.endTrialNow(userId.toString()),
      ).rejects.toMatchObject({ name: "BillingHttpError", status: 400 });
    });
  });

  describe("getSubscriptionSummary", () => {
    const periodEnd = new Date("2026-10-01T00:00:00.000Z");
    const trialEnd = new Date("2026-09-10T00:00:00.000Z");

    const seedUser = async (billing: Schema_UserBilling) => {
      const userId = mongoService.objectId();
      await mongoService.user.insertOne({
        _id: userId,
        email: "sub@example.com",
        name: "Sub User",
        firstName: "Sub",
        lastName: "User",
        locale: "en",
        billing,
      });
      return userId;
    };

    const cardPaymentMethod = {
      id: "pm_card",
      card: {
        brand: "visa",
        last4: "4242",
        exp_month: 12,
        exp_year: 2030,
      },
    };

    const liveSubscription = (
      paymentMethod: unknown,
      overrides: Record<string, unknown> = {},
    ) => ({
      id: "sub_live",
      status: "active",
      customer: "cus_live",
      cancel_at_period_end: false,
      default_payment_method: paymentMethod,
      items: {
        data: [
          {
            price: {
              id: "price_test",
              unit_amount: 1200,
              currency: "usd",
              recurring: { interval: "month" },
            },
            current_period_end: 1_758_800_000,
          },
        ],
      },
      ...overrides,
    });

    it("maps price, card, and invoices from Stripe", async () => {
      using _env = mockEnv(stripeConfigured);
      const userId = await seedUser({
        subscriptionStatus: "active",
        stripeCustomerId: "cus_live",
        stripeSubscriptionId: "sub_live",
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        trialEndsAt: trialEnd,
      });

      const retrieve = mock(() =>
        Promise.resolve(liveSubscription(cardPaymentMethod)),
      );
      const customersRetrieve = mock();
      const invoicesList = mock(() =>
        Promise.resolve({
          data: [
            {
              id: "in_1",
              created: 1_756_000_000,
              amount_paid: 1200,
              currency: "usd",
              status: "paid",
              hosted_invoice_url: "https://invoice.stripe.com/i/1",
            },
          ],
        }),
      );
      const stripeService = new StripeService(
        stubBillingGateway({
          retrieveCustomer: customersRetrieve,
          retrieveSubscription: retrieve,
          listInvoices: invoicesList,
        }),
      );

      const result = await stripeService.getSubscriptionSummary(
        userId.toString(),
      );

      expect((retrieve.mock.calls as unknown[][])[0]?.[0]).toBe("sub_live");
      expect((retrieve.mock.calls as unknown[][])[0]?.[1]).toEqual({
        expand: ["default_payment_method"],
      });
      expect(customersRetrieve).not.toHaveBeenCalled();
      expect((invoicesList.mock.calls as unknown[][])[0]?.[0]).toEqual({
        customer: "cus_live",
        limit: 12,
      });
      expect(result).toEqual({
        subscriptionStatus: "active",
        currentPeriodEnd: periodEnd.toISOString(),
        cancelAtPeriodEnd: false,
        trialEndsAt: trialEnd.toISOString(),
        price: { amount: 1200, currency: "usd", interval: "month" },
        paymentMethod: {
          brand: "visa",
          last4: "4242",
          expMonth: 12,
          expYear: 2030,
        },
        invoices: [
          {
            id: "in_1",
            createdAt: new Date(1_756_000_000 * 1000).toISOString(),
            amountPaid: 1200,
            currency: "usd",
            status: "paid",
            hostedInvoiceUrl: "https://invoice.stripe.com/i/1",
          },
        ],
      });
    });

    it("falls back to the customer default payment method", async () => {
      using _env = mockEnv(stripeConfigured);
      const userId = await seedUser({
        subscriptionStatus: "active",
        stripeCustomerId: "cus_live",
        stripeSubscriptionId: "sub_live",
      });

      const retrieve = mock(() => Promise.resolve(liveSubscription(null)));
      const customersRetrieve = mock(() =>
        Promise.resolve({
          id: "cus_live",
          invoice_settings: { default_payment_method: cardPaymentMethod },
        }),
      );
      const stripeService = new StripeService(
        stubBillingGateway({
          retrieveCustomer: customersRetrieve,
          retrieveSubscription: retrieve,
          listInvoices: mock(() => Promise.resolve({ data: [] })),
        }),
      );

      const result = await stripeService.getSubscriptionSummary(
        userId.toString(),
      );

      expect((customersRetrieve.mock.calls as unknown[][])[0]?.[0]).toBe(
        "cus_live",
      );
      expect((customersRetrieve.mock.calls as unknown[][])[0]?.[1]).toEqual({
        expand: ["invoice_settings.default_payment_method"],
      });
      expect(result.paymentMethod).toEqual({
        brand: "visa",
        last4: "4242",
        expMonth: 12,
        expYear: 2030,
      });
    });

    it("returns nulls and skips Stripe when there is no subscription id", async () => {
      using _env = mockEnv(stripeConfigured);
      const userId = await seedUser({
        subscriptionStatus: "awaiting_checkout",
        stripeCustomerId: "cus_pending",
      });

      const retrieve = mock(() => Promise.reject(new Error("no stripe")));
      const invoicesList = mock(() => Promise.reject(new Error("no stripe")));
      const stripeService = new StripeService(
        stubBillingGateway({
          retrieveSubscription: retrieve,
          listInvoices: invoicesList,
        }),
      );

      const result = await stripeService.getSubscriptionSummary(
        userId.toString(),
      );

      expect(retrieve).not.toHaveBeenCalled();
      expect(invoicesList).not.toHaveBeenCalled();
      expect(result).toEqual({
        subscriptionStatus: "awaiting_checkout",
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        trialEndsAt: null,
        price: null,
        paymentMethod: null,
        invoices: [],
      });
    });
  });

  describe("setCancelAtPeriodEnd", () => {
    const seedSubscriber = async (billing: Record<string, unknown> = {}) => {
      const userId = mongoService.objectId();
      await mongoService.user.insertOne({
        _id: userId,
        email: "cancel@example.com",
        name: "Cancel User",
        firstName: "Cancel",
        lastName: "User",
        locale: "en",
        billing: {
          subscriptionStatus: "active",
          stripeCustomerId: "cus_live",
          stripeSubscriptionId: "sub_live",
          ...billing,
        },
      });
      return userId;
    };

    const updatedSubscription = (cancelAtPeriodEnd: boolean) =>
      ({
        id: "sub_live",
        status: "active",
        customer: "cus_live",
        cancel_at_period_end: cancelAtPeriodEnd,
        items: {
          data: [
            {
              price: { id: "price_test" },
              current_period_end: 1_758_800_000,
            },
          ],
        },
      }) as unknown as Stripe.Subscription;

    it("cancels at period end and returns the fresh status", async () => {
      using _env = mockEnv(stripeConfigured);
      const userId = await seedSubscriber();
      const update = mock(() => Promise.resolve(updatedSubscription(true)));
      const stripeService = new StripeService(
        stubBillingGateway({
          updateSubscription: update,
        }),
      );

      const result = await stripeService.setCancelAtPeriodEnd(
        userId.toString(),
        true,
      );

      expect((update.mock.calls as unknown[][])[0]?.[0]).toBe("sub_live");
      expect((update.mock.calls as unknown[][])[0]?.[1]).toEqual({
        cancel_at_period_end: true,
      });
      expect(result.cancelAtPeriodEnd).toBe(true);
      expect(result.subscriptionStatus).toBe("active");
      const stored = await mongoService.user.findOne({ _id: userId });
      expect(stored?.billing?.cancelAtPeriodEnd).toBe(true);
    });

    it("resumes a subscription scheduled to cancel", async () => {
      using _env = mockEnv(stripeConfigured);
      const userId = await seedSubscriber({ cancelAtPeriodEnd: true });
      const update = mock(() => Promise.resolve(updatedSubscription(false)));
      const stripeService = new StripeService(
        stubBillingGateway({
          updateSubscription: update,
        }),
      );

      const result = await stripeService.setCancelAtPeriodEnd(
        userId.toString(),
        false,
      );

      expect((update.mock.calls as unknown[][])[0]?.[1]).toEqual({
        cancel_at_period_end: false,
      });
      expect(result.cancelAtPeriodEnd).toBe(false);
      const stored = await mongoService.user.findOne({ _id: userId });
      expect(stored?.billing?.cancelAtPeriodEnd).toBe(false);
    });

    it.each([
      "awaiting_checkout",
      "expired",
      "canceled",
    ] as const)("rejects with 409 when status is %s", async (status) => {
      using _env = mockEnv(stripeConfigured);
      const userId = await seedSubscriber({ subscriptionStatus: status });
      const update = mock(() => Promise.resolve(updatedSubscription(true)));
      const stripeService = new StripeService(
        stubBillingGateway({
          updateSubscription: update,
        }),
      );

      await expect(
        stripeService.setCancelAtPeriodEnd(userId.toString(), true),
      ).rejects.toMatchObject({
        name: "BillingHttpError",
        status: 409,
        clientMessage: "No active subscription to update.",
      });
      expect(update).not.toHaveBeenCalled();
    });

    it("rejects with 409 when there is no subscription id", async () => {
      using _env = mockEnv(stripeConfigured);
      const userId = await seedSubscriber({
        stripeSubscriptionId: undefined,
      });
      const stripeService = new StripeService(stubBillingGateway({}));

      await expect(
        stripeService.setCancelAtPeriodEnd(userId.toString(), true),
      ).rejects.toMatchObject({
        status: 409,
        clientMessage: "No active subscription to update.",
      });
    });
  });

  describe("createPaymentMethodSession", () => {
    it("creates a setup-mode embedded Checkout session", async () => {
      using _env = mockEnv(stripeConfigured);
      const userId = mongoService.objectId();
      await mongoService.user.insertOne({
        _id: userId,
        email: "card@example.com",
        name: "Card User",
        firstName: "Card",
        lastName: "User",
        locale: "en",
        billing: {
          subscriptionStatus: "active",
          stripeCustomerId: "cus_card",
          stripeSubscriptionId: "sub_card",
        },
      });

      const sessionsCreate = mock(() =>
        Promise.resolve({ client_secret: "seti_secret_1" }),
      );
      const stripeService = new StripeService(
        stubBillingGateway({
          createCheckoutSession: sessionsCreate,
        }),
      );

      const result = await stripeService.createPaymentMethodSession(
        userId.toString(),
      );

      expect(result).toEqual({ clientSecret: "seti_secret_1" });
      expect((sessionsCreate.mock.calls as unknown[][])[0]?.[0]).toEqual({
        mode: "setup",
        customer: "cus_card",
        payment_method_types: ["card"],
        ui_mode: "embedded",
        redirect_on_completion: "never",
        client_reference_id: userId.toString(),
        setup_intent_data: { metadata: { compassUserId: userId.toString() } },
      });
      expect(
        (sessionsCreate.mock.calls as unknown[][])[0]?.[1],
      ).toBeUndefined();
    });

    it("rejects with 409 and skips Stripe when the user has no customer id", async () => {
      using _env = mockEnv(stripeConfigured);
      const userId = mongoService.objectId();
      await mongoService.user.insertOne({
        _id: userId,
        email: "none@example.com",
        name: "None User",
        firstName: "None",
        lastName: "User",
        locale: "en",
        billing: { subscriptionStatus: "awaiting_checkout" },
      });

      const sessionsCreate = mock(() =>
        Promise.resolve({ client_secret: "seti_secret_1" }),
      );
      const stripeService = new StripeService(
        stubBillingGateway({
          createCheckoutSession: sessionsCreate,
        }),
      );

      await expect(
        stripeService.createPaymentMethodSession(userId.toString()),
      ).rejects.toMatchObject({
        name: "BillingHttpError",
        status: 409,
        clientMessage: "No billing account yet.",
      });
      expect(sessionsCreate).not.toHaveBeenCalled();
    });
  });
});
