import type Stripe from "stripe";
import { Logger } from "@core/logger/winston.logger";
import { billingAnalytics } from "@backend/billing/billing.analytics";
import {
  isStripeSubscriptionStatus,
  STRIPE_TO_COMPASS_STATUS,
} from "@backend/billing/billing.constants";
import {
  type StripeBillingGateway,
  stripeBillingGateway,
} from "@backend/billing/services/stripe.client";
import mongoService from "@backend/common/services/mongo.service";

const logger = Logger("app:billing.webhook");

const HANDLED_TYPES = new Set<Stripe.Event.Type>([
  "checkout.session.completed",
  "checkout.session.expired",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code: unknown }).code === 11000;

const toDate = (unixSeconds: number | null | undefined): Date | undefined =>
  typeof unixSeconds === "number" ? new Date(unixSeconds * 1000) : undefined;

const subscriptionIdOf = (value: unknown): string | undefined => {
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

const paymentMethodIdOf = (value: unknown): string | undefined =>
  customerIdOf(value);

/**
 * The single place Stripe subscription fields are mapped onto `billing.*`.
 * Exported because ending a trial early applies the Subscription that
 * `subscriptions.update` returns through this same path, so the caller sees
 * the new status immediately instead of waiting for the webhook to land.
 */
export async function applySubscription(
  userId: string,
  subscription: Stripe.Subscription,
  eventCreatedAt: Date,
): Promise<void> {
  if (!isStripeSubscriptionStatus(subscription.status)) {
    logger.warn(
      `Ignoring unmapped Stripe subscription status ${subscription.status}`,
    );
    return;
  }
  const status = STRIPE_TO_COMPASS_STATUS[subscription.status];

  const priceId = subscription.items.data[0]?.price?.id;
  const currentPeriodEnd = toDate(
    subscription.items.data[0]?.current_period_end ??
      (subscription as { current_period_end?: number }).current_period_end,
  );
  const trialEnd = toDate(subscription.trial_end ?? undefined);
  const trialStart = toDate(subscription.trial_start ?? undefined);

  await mongoService.user.updateOne(
    {
      _id: mongoService.objectId(userId),
      $or: [
        { "billing.lastStripeEventAt": { $lte: eventCreatedAt } },
        { "billing.lastStripeEventAt": { $exists: false } },
      ],
    },
    {
      $set: {
        "billing.subscriptionStatus": status,
        "billing.stripeCustomerId": customerIdOf(subscription.customer),
        "billing.stripeSubscriptionId": subscription.id,
        ...(priceId ? { "billing.stripePriceId": priceId } : {}),
        ...(currentPeriodEnd
          ? { "billing.currentPeriodEnd": currentPeriodEnd }
          : {}),
        "billing.cancelAtPeriodEnd": subscription.cancel_at_period_end,
        "billing.lastStripeEventAt": eventCreatedAt,
        ...(trialStart ? { "billing.trialStartedAt": trialStart } : {}),
        ...(trialEnd ? { "billing.trialEndsAt": trialEnd } : {}),
      },
    },
  );
}

async function findUserIdForSubscription(
  subscription: Stripe.Subscription,
  clientReferenceId?: string | null,
): Promise<string | null> {
  if (clientReferenceId) {
    return clientReferenceId;
  }

  const metadataUserId = subscription.metadata?.["compassUserId"];
  if (metadataUserId) return metadataUserId;

  const customerId = customerIdOf(subscription.customer);
  const bySubscription = await mongoService.user.findOne({
    "billing.stripeSubscriptionId": subscription.id,
  });
  if (bySubscription) return bySubscription._id.toString();

  if (customerId) {
    const byCustomer = await mongoService.user.findOne({
      "billing.stripeCustomerId": customerId,
    });
    if (byCustomer) return byCustomer._id.toString();
  }

  return null;
}

async function findUserIdForCheckoutSession(
  session: Pick<Stripe.Checkout.Session, "client_reference_id" | "customer">,
): Promise<string | null> {
  if (session.client_reference_id) return session.client_reference_id;
  const customerId = customerIdOf(session.customer);
  if (!customerId) return null;
  const byCustomer = await mongoService.user.findOne({
    "billing.stripeCustomerId": customerId,
  });
  return byCustomer?._id.toString() ?? null;
}

async function handleSetupCheckoutSession(
  stripe: StripeBillingGateway,
  session: Stripe.Checkout.Session,
  eventCreatedAt: Date,
): Promise<void> {
  const retrieved = await stripe.retrieveCheckoutSession(session.id, {
    expand: ["setup_intent"],
  });
  const setupIntent = retrieved.setup_intent;
  const paymentMethodId = paymentMethodIdOf(
    typeof setupIntent === "object" && setupIntent !== null
      ? setupIntent.payment_method
      : undefined,
  );
  if (!paymentMethodId) {
    throw new Error(
      `setup checkout ${session.id} had no SetupIntent payment method`,
    );
  }

  const customerId =
    customerIdOf(retrieved.customer) ?? customerIdOf(session.customer);
  let userId: string | null =
    retrieved.client_reference_id ?? session.client_reference_id ?? null;
  if (!userId && customerId) {
    const byCustomer = await mongoService.user.findOne({
      "billing.stripeCustomerId": customerId,
    });
    userId = byCustomer?._id.toString() ?? null;
  }
  if (!userId) {
    logger.warn(`No Compass user for setup checkout session ${session.id}`);
    return;
  }

  const user = await mongoService.user.findOne({
    _id: mongoService.objectId(userId),
  });
  const resolvedCustomerId = customerId ?? user?.billing?.stripeCustomerId;
  if (!resolvedCustomerId) {
    logger.warn(`No Stripe customer for setup checkout session ${session.id}`);
    return;
  }

  await stripe.updateCustomer(resolvedCustomerId, {
    invoice_settings: { default_payment_method: paymentMethodId },
  });

  const subscriptionId = user?.billing?.stripeSubscriptionId;
  if (!subscriptionId) return;

  const subscription = await stripe.updateSubscription(subscriptionId, {
    default_payment_method: paymentMethodId,
  });
  await applySubscription(userId, subscription, eventCreatedAt);
}

async function handleEvent(
  event: Stripe.Event,
  stripe: StripeBillingGateway,
): Promise<void> {
  if (!HANDLED_TYPES.has(event.type)) return;

  const eventCreatedAt = toDate(event.created) ?? new Date();

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.mode === "setup") {
      await handleSetupCheckoutSession(stripe, session, eventCreatedAt);
      return;
    }
    const subscriptionId = subscriptionIdOf(session.subscription);
    if (!subscriptionId) {
      logger.warn("checkout.session.completed had no subscription id");
      return;
    }
    const subscription = await stripe.retrieveSubscription(subscriptionId);
    const userId = await findUserIdForSubscription(
      subscription,
      session.client_reference_id,
    );
    if (!userId) {
      logger.warn(
        `No Compass user for checkout session ${session.id} (client_reference_id=${session.client_reference_id})`,
      );
      return;
    }
    await applySubscription(userId, subscription, eventCreatedAt);
    await billingAnalytics.capture({
      event: "checkout_completed",
      userId,
      properties: {
        checkout_session_id: session.id,
        subscription_status: subscription.status,
        trial: subscription.status === "trialing",
      },
    });
    return;
  }

  // An expired session is the "reached Stripe and left" signal. Nothing to
  // write: billing stays awaiting_checkout and a new session can be opened.
  if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.mode === "setup") return;
    const userId = await findUserIdForCheckoutSession(session);
    if (!userId) {
      logger.warn(`No Compass user for expired checkout session ${session.id}`);
      return;
    }
    await billingAnalytics.capture({
      event: "checkout_expired",
      userId,
      properties: { checkout_session_id: session.id },
    });
    return;
  }

  const subscriptionId = subscriptionIdOf(event.data.object);
  if (!subscriptionId) {
    logger.warn(`${event.type} had no subscription id`);
    return;
  }
  const subscription = await stripe.retrieveSubscription(subscriptionId);
  const userId = await findUserIdForSubscription(subscription);
  if (!userId) {
    logger.warn(
      `No Compass user for Stripe subscription ${subscriptionId} (${event.type})`,
    );
    return;
  }
  await applySubscription(userId, subscription, eventCreatedAt);
}

export async function processStripeEvent(
  event: Stripe.Event,
  stripe: StripeBillingGateway = stripeBillingGateway,
): Promise<void> {
  try {
    await mongoService.billingEvent.insertOne({
      _id: event.id,
      receivedAt: new Date(),
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      return;
    }
    throw error;
  }

  try {
    await handleEvent(event, stripe);
  } catch (error) {
    await mongoService.billingEvent.deleteOne({ _id: event.id });
    throw error;
  }
}
