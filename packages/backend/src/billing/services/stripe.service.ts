import type Stripe from "stripe";
import { Status } from "@core/errors/status.codes";
import {
  type BillingCheckoutResponse,
  type BillingStatusResponse,
  type BillingSubscriptionResponse,
} from "@core/types/billing.types";
import {
  BILLING_PLAN,
  getStripePriceId,
} from "@backend/billing/billing.constants";
import {
  BillingHttpError,
  wrapStripeFailure,
} from "@backend/billing/billing.errors";
import billingService from "@backend/billing/services/billing.service";
import { applySubscription } from "@backend/billing/services/billing.webhook.service";
import {
  type StripeBillingGateway,
  stripeBillingGateway,
} from "@backend/billing/services/stripe.client";
import { CONFIG } from "@backend/common/constants/config.constants";
import { isStripeConfigured } from "@backend/common/constants/config.util";
import mongoService from "@backend/common/services/mongo.service";

/** Bump when Checkout Session create params change so Stripe does not replay a failed create. */
const CHECKOUT_IDEMPOTENCY_PREFIX = "compass-checkout-v3-";

export class StripeService {
  constructor(
    private readonly stripe: StripeBillingGateway = stripeBillingGateway,
  ) {}

  /**
   * Account deletion is deliberately stronger than cancelling a plan: deleting
   * the Stripe customer immediately ends every subscription and removes saved
   * payment details. Stripe retains the financial history it is required to
   * keep, but Compass must never leave a trial able to convert after its local
   * account is gone.
   */
  deleteCustomerForAccount = async (userId: string): Promise<void> => {
    const user = await mongoService.user.findOne({
      _id: mongoService.objectId(userId),
    });
    const customerId = user?.billing?.stripeCustomerId;

    // Accounts that never reached Checkout have nothing in Stripe to remove.
    if (!customerId) return;
    if (!isStripeConfigured(CONFIG)) {
      throw new Error(
        "Stripe is not configured for an account with billing data",
      );
    }

    try {
      await this.stripe.deleteCustomer(customerId, {
        idempotencyKey: `compass-account-delete-${userId}`,
      });
    } catch (error) {
      // A prior attempt may have completed in Stripe before a transient error
      // stopped the local deletion. Treat that retry as success so deletion is
      // safely repeatable rather than marooning an already-cancelled account.
      if (isMissingStripeCustomer(error)) {
        return;
      }
      wrapStripeFailure(error);
    }
  };

  createCheckoutSession = async (
    userId: string,
  ): Promise<BillingCheckoutResponse> => {
    if (!isStripeConfigured(CONFIG)) {
      throw new Error("Stripe is not configured");
    }

    const _id = mongoService.objectId(userId);
    const user = await mongoService.user.findOne({ _id });
    if (!user) {
      throw new Error("User not found");
    }

    const liveStatus = user.billing?.subscriptionStatus;
    const hasLiveSubscription =
      Boolean(user.billing?.stripeSubscriptionId) &&
      (liveStatus === "trialing" ||
        liveStatus === "active" ||
        liveStatus === "past_due");
    if (hasLiveSubscription) {
      throw new BillingHttpError(
        Status.CONFLICT,
        "You already have a subscription. Manage it under Settings > Billing.",
      );
    }

    let customerId = user.billing?.stripeCustomerId;
    const grantTrial = !user.billing?.stripeSubscriptionId;

    if (!customerId) {
      const customer = await this.stripe
        .createCustomer(
          {
            email: user.email,
            metadata: { compassUserId: userId },
          },
          { idempotencyKey: `compass-customer-${userId}` },
        )
        .catch(wrapStripeFailure);
      customerId = customer.id;
      await mongoService.user.updateOne(
        { _id },
        {
          $set: {
            "billing.stripeCustomerId": customerId,
            ...(!user.billing?.subscriptionStatus ||
            user.billing.subscriptionStatus === "none"
              ? { "billing.subscriptionStatus": "awaiting_checkout" }
              : {}),
          },
        },
      );
    }

    const session = await this.stripe
      .createCheckoutSession(
        {
          mode: "subscription",
          customer: customerId,
          client_reference_id: userId,
          line_items: [{ price: getStripePriceId(), quantity: 1 }],
          // Card is required to start the trial. Default is `always`, but pin
          // it so a Dashboard setting cannot silently skip collection.
          payment_method_collection: "always",
          // Stripe Tax is a create-param, not a Dashboard toggle. Because we
          // always pass an existing `customer`, these three go together: the
          // billing address has to be collected and written back to the
          // Customer or there is no address to calculate tax from.
          automatic_tax: { enabled: true },
          customer_update: { address: "auto" },
          billing_address_collection: "required",
          ui_mode: "embedded",
          redirect_on_completion: "never",
          subscription_data: {
            ...(grantTrial
              ? {
                  trial_period_days: BILLING_PLAN.TRIAL_LENGTH_DAYS,
                  trial_settings: {
                    end_behavior: { missing_payment_method: "cancel" },
                  },
                }
              : {}),
            metadata: { compassUserId: userId },
          },
        },
        grantTrial
          ? { idempotencyKey: `${CHECKOUT_IDEMPOTENCY_PREFIX}${userId}` }
          : undefined,
      )
      .catch(wrapStripeFailure);

    if (!session.client_secret) {
      throw new Error("Stripe Checkout did not return a client secret");
    }

    return { clientSecret: session.client_secret };
  };

  /**
   * Ends a Stripe trial immediately, billing the card on file today. This is
   * the only way to convert early.
   *
   * The updated Subscription is written back through the webhook's
   * `applySubscription`, so the caller's next status read is already correct
   * and the trial badge clears without waiting for the webhook round trip.
   * The webhook still arrives and is a no-op by way of the
   * `lastStripeEventAt` guard.
   *
   * If the charge fails Stripe moves the subscription to `past_due`, which
   * stays writable and raises the dunning banner. The caller is told the
   * resulting status rather than a blanket success.
   *
   * A cancel scheduled at period end is cleared here: subscribing now and
   * cancelling at period end are contradictory instructions, and the one the
   * user just gave wins.
   */
  endTrialNow = async (userId: string): Promise<BillingStatusResponse> => {
    if (!isStripeConfigured(CONFIG)) {
      throw new Error("Stripe is not configured");
    }

    const _id = mongoService.objectId(userId);
    const user = await mongoService.user.findOne({ _id });
    if (!user) {
      throw new Error("User not found");
    }

    const subscriptionId = user.billing?.stripeSubscriptionId;
    if (!subscriptionId || user.billing?.subscriptionStatus !== "trialing") {
      throw new BillingHttpError(Status.CONFLICT, "No active trial to end.");
    }

    const subscription = await this.stripe
      .updateSubscription(
        subscriptionId,
        {
          trial_end: "now",
          proration_behavior: "none",
          cancel_at_period_end: false,
        },
        // v2 when cancel_at_period_end was added, same reason as the
        // checkout prefix: a param change must not replay as the old call.
        { idempotencyKey: `compass-end-trial-v2-${subscriptionId}` },
      )
      .catch(wrapStripeFailure);

    await applySubscription(userId, subscription, new Date());

    return billingService.getStatus(userId);
  };

  getSubscriptionSummary = async (
    userId: string,
  ): Promise<BillingSubscriptionResponse> => {
    const _id = mongoService.objectId(userId);
    const user = await mongoService.user.findOne({ _id });
    if (!user) {
      throw new Error("User not found");
    }

    const billing = user.billing;
    const mongo = {
      subscriptionStatus: billing?.subscriptionStatus ?? "none",
      currentPeriodEnd: billing?.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: billing?.cancelAtPeriodEnd === true,
      trialEndsAt: billing?.trialEndsAt?.toISOString() ?? null,
    };

    const subscriptionId = billing?.stripeSubscriptionId;
    if (!subscriptionId) {
      return { ...mongo, price: null, paymentMethod: null, invoices: [] };
    }

    if (!isStripeConfigured(CONFIG)) {
      throw new Error("Stripe is not configured");
    }

    const subscription = await this.stripe
      .retrieveSubscription(subscriptionId, {
        expand: ["default_payment_method"],
      })
      .catch(wrapStripeFailure);

    let paymentMethod = cardFromPaymentMethod(
      subscription.default_payment_method,
    );
    const customerId =
      customerIdOf(subscription.customer) ?? billing?.stripeCustomerId;
    if (!paymentMethod && customerId) {
      const customer = await this.stripe
        .retrieveCustomer(customerId, {
          expand: ["invoice_settings.default_payment_method"],
        })
        .catch(wrapStripeFailure);
      if (!("deleted" in customer && customer.deleted)) {
        paymentMethod = cardFromPaymentMethod(
          customer.invoice_settings.default_payment_method,
        );
      }
    }

    const invoices = customerId
      ? (
          await this.stripe
            .listInvoices({ customer: customerId, limit: 12 })
            .catch(wrapStripeFailure)
        ).data.flatMap((invoice) => {
          const mapped = mapInvoice(invoice);
          return mapped ? [mapped] : [];
        })
      : [];

    return {
      ...mongo,
      price: mapPrice(subscription),
      paymentMethod,
      invoices,
    };
  };

  setCancelAtPeriodEnd = async (
    userId: string,
    cancel: boolean,
  ): Promise<BillingStatusResponse> => {
    if (!isStripeConfigured(CONFIG)) {
      throw new Error("Stripe is not configured");
    }

    const _id = mongoService.objectId(userId);
    const user = await mongoService.user.findOne({ _id });
    if (!user) {
      throw new Error("User not found");
    }

    const status = user.billing?.subscriptionStatus;
    const subscriptionId = user.billing?.stripeSubscriptionId;
    const canUpdate =
      Boolean(subscriptionId) &&
      (status === "trialing" || status === "active" || status === "past_due");
    if (!subscriptionId || !canUpdate) {
      throw new BillingHttpError(
        Status.CONFLICT,
        "No active subscription to update.",
      );
    }

    const subscription = await this.stripe
      .updateSubscription(subscriptionId, { cancel_at_period_end: cancel })
      .catch(wrapStripeFailure);

    await applySubscription(userId, subscription, new Date());

    return billingService.getStatus(userId);
  };

  createPaymentMethodSession = async (
    userId: string,
  ): Promise<BillingCheckoutResponse> => {
    if (!isStripeConfigured(CONFIG)) {
      throw new Error("Stripe is not configured");
    }

    const _id = mongoService.objectId(userId);
    const user = await mongoService.user.findOne({ _id });
    if (!user) {
      throw new Error("User not found");
    }

    const customerId = user.billing?.stripeCustomerId;
    if (!customerId) {
      throw new BillingHttpError(Status.CONFLICT, "No billing account yet.");
    }

    const session = await this.stripe
      .createCheckoutSession({
        mode: "setup",
        customer: customerId,
        payment_method_types: ["card"],
        ui_mode: "embedded",
        redirect_on_completion: "never",
        client_reference_id: userId,
        setup_intent_data: { metadata: { compassUserId: userId } },
      })
      .catch(wrapStripeFailure);

    if (!session.client_secret) {
      throw new Error("Stripe Checkout did not return a client secret");
    }

    return { clientSecret: session.client_secret };
  };
}

function isMissingStripeCustomer(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    statusCode?: unknown;
  };
  return (
    candidate.code === "resource_missing" ||
    (candidate.statusCode === 404 &&
      typeof candidate.message === "string" &&
      candidate.message.startsWith("No such customer"))
  );
}

const customerIdOf = (value: unknown): string | undefined => {
  if (typeof value === "string" && value.length > 0) return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof (value as { id: unknown }).id === "string"
  ) {
    return (value as { id: string }).id;
  }
  return undefined;
};

const cardFromPaymentMethod = (
  value: unknown,
): BillingSubscriptionResponse["paymentMethod"] => {
  if (typeof value !== "object" || value === null) return null;
  const card = (value as Stripe.PaymentMethod).card;
  if (!card?.brand || !card.last4) return null;
  return {
    brand: card.brand,
    last4: card.last4,
    expMonth: card.exp_month,
    expYear: card.exp_year,
  };
};

type BillingInterval = NonNullable<
  BillingSubscriptionResponse["price"]
>["interval"];

const isBillingInterval = (value: string): value is BillingInterval =>
  value === "day" || value === "week" || value === "month" || value === "year";

const mapPrice = (
  subscription: Stripe.Subscription,
): BillingSubscriptionResponse["price"] => {
  const price = subscription.items.data[0]?.price;
  if (!price || typeof price === "string") return null;
  const amount = price.unit_amount;
  const interval = price.recurring?.interval;
  if (
    amount == null ||
    !price.currency ||
    !interval ||
    !isBillingInterval(interval)
  ) {
    return null;
  }
  return { amount, currency: price.currency, interval };
};

const mapInvoice = (
  invoice: Stripe.Invoice,
): BillingSubscriptionResponse["invoices"][number] | null => {
  if (!invoice.id) return null; // basil types leave Invoice.id optional
  return {
    id: invoice.id,
    createdAt: new Date(invoice.created * 1000).toISOString(),
    amountPaid: invoice.amount_paid,
    currency: invoice.currency,
    status: invoice.status ?? "unknown",
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
  };
};

export default new StripeService();
